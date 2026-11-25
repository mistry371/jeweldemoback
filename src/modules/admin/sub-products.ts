import { and, asc, eq, inArray, isNull, max, ne, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import type { ImageAsset, ProductStatus } from "@/contracts/common";
import { db, type Executor, type Tx } from "@/db/client";
import { inventoryLevels, parentProducts, productCollections, products } from "@/db/schema";
import { requirePermission } from "@/http/auth";
import { AppError, invalid, notFound } from "@/lib/errors";
import { round2 } from "@/lib/money";
import { parse, zImage, zUuid } from "@/lib/validation";
import { labelKey, variantLabelOf } from "@/modules/catalog/labels";
import { loadPricingContext } from "@/modules/pricing/context";
import { actorOf, recordAudit } from "@/services/audit";
import { afterCatalogChange } from "@/services/revalidate";
import { currentPrice, productShape, validateProduct } from "./catalogue";
import { idParam, withUniqueFields } from "./helpers";
import { writeVariants, type VariantInput } from "./parent-products";
import { createContainerFor, deleteContainer, slugify, syncContainerFromMain, uniqueSlug } from "./variant-rules";

/**
 * SUB-PRODUCTS
 * ------------------------------------------------------------------
 * The shop owner only works with products: a **main product** can have
 * **sub-products** — other real products (own SKU, stock and price) shown as
 * options on the main product's page. Underneath, a hidden `parent_products`
 * row (the "container") groups them: the main product is its default variant
 * and the sub-products are its other variants. The container is created with
 * the first sub-product and deleted with the last, so the owner never sees it.
 */
export const subProductsRouter = Router();

/* ------------------------------------------------------------------ */
/* Schemas                                                             */
/* ------------------------------------------------------------------ */

/** A group holds the main product plus up to 49 sub-products (the variant limit is 50). */
const replaceSchema = z.object({
  items: z.array(z.object({ productId: zUuid })).max(49),
  /** Accept sub-products that belong to another main product and take them from it. */
  move: z.boolean().default(false),
});

const quickCreateSchema = z.object({
  name: productShape.name,
  images: z.array(zImage).max(12).default([]),
  netWeight: productShape.netWeight.optional(),
  makingValue: productShape.makingValue.optional(),
});

/** Like `parse`, but reports per-row problems as `items.<index>` (never `items.<index>.productId`). */
function parseItems(body: unknown) {
  try {
    return parse(replaceSchema, body);
  } catch (error) {
    if (!(error instanceof AppError) || !error.fieldErrors) throw error;
    const fieldErrors: Record<string, string> = {};
    for (const [key, message] of Object.entries(error.fieldErrors)) fieldErrors[key.replace(/^(items\.\d+)\..*$/, "$1")] ??= message;
    throw invalid(fieldErrors);
  }
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

type ProductRow = typeof products.$inferSelect;
type ContainerRow = typeof parentProducts.$inferSelect;

export interface SubProductsView {
  main: { id: string; sku: string; name: string; image: ImageAsset | null };
  /** Set when this product is itself a sub-product of another main product; then `items` is empty. */
  belongsTo: { id: string; sku: string; name: string } | null;
  items: { productId: string; sku: string; name: string; slug: string; image: ImageAsset | null; price: number | null; stock: number; status: ProductStatus }[];
}

async function loadProduct(ex: Executor, id: string, lock = false) {
  const query = ex
    .select()
    .from(products)
    .where(and(eq(products.id, id), isNull(products.deletedAt)));
  const [row] = lock ? await query.for("update") : await query.limit(1);
  if (!row) throw notFound("Product not found.");
  return row;
}

const containerOf = async (ex: Executor, parentId: string | null) =>
  parentId ? ((await ex.select().from(parentProducts).where(eq(parentProducts.id, parentId)).limit(1))[0] ?? null) : null;

/** The main product of `container` — its default variant. */
const mainOf = async (ex: Executor, container: ContainerRow) =>
  container.defaultVariantId
    ? ((
        await ex
          .select({ id: products.id, sku: products.sku, name: products.name })
          .from(products)
          .where(and(eq(products.id, container.defaultVariantId), isNull(products.deletedAt)))
          .limit(1)
      )[0] ?? null)
    : null;

/** The sub-products of `container`, in display order, without its main product. */
async function subProductRows(ex: Executor, container: ContainerRow, mainId: string) {
  return ex
    .select()
    .from(products)
    .where(and(eq(products.parentId, container.id), ne(products.id, mainId), isNull(products.deletedAt)))
    .orderBy(asc(products.variantOrder), asc(products.sku));
}

/** What the product's own page shows: the product, who it belongs to, and its sub-products. */
async function subProductsView(ex: Executor, productId: string): Promise<SubProductsView> {
  const main = await loadProduct(ex, productId);
  const container = await containerOf(ex, main.parentId);
  const image = (row: ProductRow) => row.images[0] ?? container?.images[0] ?? null;
  const self = { id: main.id, sku: main.sku, name: main.name, image: image(main) };

  if (container && container.defaultVariantId && container.defaultVariantId !== main.id) {
    const owner = await mainOf(ex, container);
    if (owner) return { main: self, belongsTo: owner, items: [] };
  }

  const rows = container ? await subProductRows(ex, container, main.id) : [];
  const ids = rows.map((row) => row.id);
  const stock = ids.length
    ? await ex
        .select({ productId: inventoryLevels.productId, total: sql<number>`coalesce(sum(${inventoryLevels.quantity}), 0)`.mapWith(Number) })
        .from(inventoryLevels)
        .where(inArray(inventoryLevels.productId, ids))
        .groupBy(inventoryLevels.productId)
    : [];
  const links = ids.length ? await ex.select().from(productCollections).where(inArray(productCollections.productId, ids)) : [];
  const context = ids.length ? await loadPricingContext(ex) : null;

  return {
    main: self,
    belongsTo: null,
    items: rows.map((row) => ({
      productId: row.id,
      sku: row.sku,
      name: row.name,
      slug: row.slug,
      image: image(row),
      price:
        currentPrice(
          row,
          links.filter((link) => link.productId === row.id).map((link) => link.collectionId),
          context!,
        ).pricing?.finalPrice ?? null,
      stock: stock.find((entry) => entry.productId === row.id)?.total ?? 0,
      status: row.status,
    })),
  };
}

/**
 * After products were taken out of another group: the group goes when only its
 * main product is left, and a group that lost its main product gets the first of
 * the remaining products as its new one. Returns the group's slug, if it stays.
 */
async function tidyContainer(tx: Tx, containerId: string) {
  const [container] = await tx.select().from(parentProducts).where(eq(parentProducts.id, containerId)).limit(1);
  if (!container) return null;
  const members = await tx
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.parentId, containerId), isNull(products.deletedAt)))
    .orderBy(asc(products.variantOrder), asc(products.sku));
  if (members.length <= 1) {
    await deleteContainer(tx, containerId);
    return null;
  }
  if (!members.some((member) => member.id === container.defaultVariantId)) {
    await tx.update(parentProducts).set({ defaultVariantId: members[0]!.id, updatedAt: new Date() }).where(eq(parentProducts.id, containerId));
    await syncContainerFromMain(tx, members[0]!.id);
  }
  return container.slug;
}

/** Sub-products are managed on the main product, never on a sub-product. */
function assertIsMain(main: ProductRow, container: ContainerRow | null) {
  if (container && container.defaultVariantId && container.defaultVariantId !== main.id) {
    throw new AppError("validation_error", `${main.sku} is a sub-product of another product. Manage the group on that main product.`);
  }
}

const auditItems = (view: SubProductsView) => view.items.map((item) => `${item.sku} (${item.name})`);

const tagsOf = (slugs: (string | null | undefined)[]) => [...new Set(slugs.filter((slug): slug is string => Boolean(slug)))].map((slug) => `product:${slug}`);

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

subProductsRouter.get("/products/:id/sub-products", requirePermission("products:view"), async (req, res) => {
  res.json(await subProductsView(db(), idParam(req)));
});

/**
 * Replaces the whole set of sub-products, in the given display order. The first
 * one creates the hidden container from the main product's details; removing the
 * last one deletes it and leaves every product standalone.
 */
subProductsRouter.put("/products/:id/sub-products", requirePermission("products:edit_content"), async (req, res) => {
  const id = idParam(req);
  const input = parseItems(req.body);
  const actor = actorOf(req);

  const result = await db().transaction(async (tx) => {
    const main = await loadProduct(tx, id, true);
    const container = await containerOf(tx, main.parentId);
    assertIsMain(main, container);
    const before = await subProductsView(tx, id);

    /* ---- Every listed product must exist, appear once, be free and have its own name ---- */
    const ids = input.items.map((item) => item.productId);
    const rows = ids.length
      ? await tx
          .select({ id: products.id, sku: products.sku, name: products.name, slug: products.slug, parentId: products.parentId, parentName: parentProducts.name })
          .from(products)
          .leftJoin(parentProducts, eq(parentProducts.id, products.parentId))
          .where(and(inArray(products.id, [...new Set(ids)]), isNull(products.deletedAt)))
      : [];
    const byId = new Map(rows.map((row) => [row.id, row]));
    const errors: Record<string, string> = {};
    const names = new Map<string, { sku: string; name: string }>([[labelKey(main.name), { sku: main.sku, name: main.name }]]);
    const seen = new Set<string>();
    input.items.forEach((item, index) => {
      const key = `items.${index}`;
      const row = byId.get(item.productId);
      if (item.productId === main.id) {
        errors[key] = `${main.sku} is the main product and is always the first of the group.`;
        return;
      }
      if (seen.has(item.productId)) {
        errors[key] = `${row?.sku ?? "This product"} is listed more than once.`;
        return;
      }
      seen.add(item.productId);
      if (!row) {
        errors[key] = "This product no longer exists.";
        return;
      }
      if (row.parentId && row.parentId !== container?.id && !input.move) {
        errors[key] = `${row.sku} already belongs to “${row.parentName}”. Remove it there first.`;
        return;
      }
      const clash = names.get(labelKey(row.name));
      if (clash) {
        errors[key] = `${row.sku} and ${clash.sku} are both called “${row.name}”. Give each product in a group its own name.`;
        return;
      }
      names.set(labelKey(row.name), { sku: row.sku, name: row.name });
    });
    if (Object.keys(errors).length) throw invalid(errors);

    /* ---- Write ---- */
    const sources = [...new Set(rows.map((row) => row.parentId).filter((parentId): parentId is string => Boolean(parentId) && parentId !== container?.id))];
    let containerSlug = container?.slug ?? null;
    let containerChange: "created" | "deleted" | null = null;
    if (!ids.length) {
      if (container) {
        await deleteContainer(tx, container.id);
        containerChange = "deleted";
      }
    } else {
      let target = container;
      if (!target) {
        target = await createContainerFor(tx, main);
        containerSlug = target.slug;
        containerChange = "created";
      }
      // The label is the product's own name — that is what customers pick between.
      const variants: VariantInput[] = [
        { productId: main.id, label: main.name },
        ...input.items.map((item) => ({ productId: item.productId, label: byId.get(item.productId)!.name })),
      ];
      await writeVariants(tx, target.id, variants, input.move);
      await tx.update(parentProducts).set({ defaultVariantId: main.id, updatedAt: new Date() }).where(eq(parentProducts.id, target.id));
    }
    const sourceSlugs: (string | null)[] = [];
    for (const sourceId of sources) sourceSlugs.push(await tidyContainer(tx, sourceId));

    const after = await subProductsView(tx, id);
    await recordAudit(tx, actor, {
      module: "products",
      action: "product.sub_products",
      entityType: "product",
      entityId: main.id,
      entityLabel: `${main.sku} ${main.name}`,
      before: { subProducts: auditItems(before) },
      after: { subProducts: auditItems(after), ...(containerChange ? { group: containerChange } : {}) },
    });
    return {
      view: after,
      slugs: [main.slug, containerSlug, ...sourceSlugs, ...before.items.map((item) => item.slug), ...after.items.map((item) => item.slug)],
    };
  });
  afterCatalogChange(tagsOf(result.slugs));
  res.json(result.view);
});

/* ------------------------------------------------------------------ */
/* Quick create: same piece, different photo                           */
/* ------------------------------------------------------------------ */

/** `<main sku>-2`, `-3`… — the first SKU no product uses. */
async function uniqueSku(ex: Executor, base: string) {
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const tail = `-${suffix}`;
    const candidate = `${base.slice(0, 40 - tail.length)}${tail}`;
    const [taken] = await ex.select({ id: products.id }).from(products).where(eq(products.sku, candidate)).limit(1);
    if (!taken) return candidate;
  }
  const tail = `-${Date.now().toString(36).toUpperCase()}`;
  return `${base.slice(0, 40 - tail.length)}${tail}`;
}

/**
 * Everything that decides what the piece is and what it costs is copied, so the
 * new sub-product prices exactly like the main product unless the weight or the
 * making charge is overridden. Descriptions and SEO come from the group.
 */
function copyOfMain(main: ProductRow, input: z.output<typeof quickCreateSchema>) {
  const netWeight = input.netWeight ?? main.netWeight;
  const delta = round2(netWeight - main.netWeight);
  const sizeWeights = Object.fromEntries(Object.entries(main.sizeWeights).map(([size, weight]) => [size, Math.max(round2(weight + delta), 0.01)]));
  return {
    name: input.name,
    images: input.images,
    categoryId: main.categoryId,
    subcategoryId: main.subcategoryId,
    metal: main.metal,
    purity: main.purity,
    gender: main.gender,
    netWeight,
    // The non-metal part (beads, stringing, stones) is kept, so a weight override only moves the metal.
    grossWeight: main.grossWeight === null ? null : Math.max(round2(main.grossWeight + delta), netWeight),
    stoneWeight: main.stoneWeight,
    stoneDetails: main.stoneDetails,
    makingType: main.makingType,
    makingValue: input.makingValue ?? main.makingValue,
    stoneCharges: main.stoneCharges,
    otherCharges: main.otherCharges,
    discount: main.discount,
    sizing: main.sizing,
    sizeOptions: main.sizeOptions,
    defaultSize: main.defaultSize,
    sizeWeights,
    unavailableSizes: main.unavailableSizes,
    customization: main.customization,
    lowStockThreshold: main.lowStockThreshold,
    status: main.status,
  };
}

/** Attaches a product as the last sub-product of an existing container. */
async function appendSubProduct(tx: Tx, containerId: string, productId: string, label: string) {
  const [last] = await tx.select({ value: max(products.variantOrder) }).from(products).where(eq(products.parentId, containerId));
  await tx
    .update(products)
    .set({ parentId: containerId, variantCustomLabel: label, variantOrder: (last?.value ?? 0) + 1, updatedAt: new Date() })
    .where(eq(products.id, productId));
}

/**
 * Creates a brand-new product from the main product — the "same size, same
 * price, different photo" case — and attaches it as the last sub-product.
 */
subProductsRouter.post("/products/:id/sub-products", requirePermission("products:edit_content"), async (req, res) => {
  const id = idParam(req);
  const input = parse(quickCreateSchema, req.body);
  const actor = actorOf(req);

  const result = await withUniqueFields(
    () =>
      db().transaction(async (tx) => {
        const main = await loadProduct(tx, id, true);
        const container = await containerOf(tx, main.parentId);
        assertIsMain(main, container);

        /* ---- The name is the option customers pick, so it must be free within the group ---- */
        const taken = new Map<string, string>([[labelKey(main.name), main.sku]]);
        if (container) for (const row of await subProductRows(tx, container, main.id)) taken.set(labelKey(variantLabelOf(row)), row.sku);
        const clash = taken.get(labelKey(input.name));
        if (clash) throw invalid({ name: `${clash} in this group is already called “${input.name}”. Give this sub-product its own name.` });

        const values = copyOfMain(main, input);
        const collectionIds = (await tx.select({ id: productCollections.collectionId }).from(productCollections).where(eq(productCollections.productId, main.id))).map((c) => c.id);
        // An active product needs a photo of its own or one it inherits from the group (the main product's).
        await validateProduct(tx, { ...values, vendorId: null, collectionIds, images: values.images.length ? values.images : (container?.images ?? main.images) });

        const slug = await uniqueSlug(tx, slugify(input.name));
        const sku = await uniqueSku(tx, main.sku);
        const [created] = await tx
          .insert(products)
          .values({ ...values, slug, sku })
          .returning();
        if (collectionIds.length) await tx.insert(productCollections).values([...new Set(collectionIds)].map((collectionId) => ({ productId: created!.id, collectionId })));

        let containerSlug = container?.slug ?? null;
        if (container) {
          await appendSubProduct(tx, container.id, created!.id, created!.name);
        } else {
          const target = await createContainerFor(tx, main);
          containerSlug = target.slug;
          await writeVariants(tx, target.id, [
            { productId: main.id, label: main.name },
            { productId: created!.id, label: created!.name },
          ]);
        }

        await recordAudit(tx, actor, {
          module: "products",
          action: "product.create",
          entityType: "product",
          entityId: created!.id,
          entityLabel: `${created!.sku} ${created!.name}`,
          after: { sku: created!.sku, name: created!.name, status: created!.status, subProductOf: main.sku },
        });
        await recordAudit(tx, actor, {
          module: "products",
          action: "product.sub_product_create",
          entityType: "product",
          entityId: main.id,
          entityLabel: `${main.sku} ${main.name}`,
          after: { subProduct: `${created!.sku} (${created!.name})`, ...(container ? {} : { group: "created" }) },
        });
        const view = await subProductsView(tx, id);
        return { view, slugs: [main.slug, containerSlug, created!.slug] };
      }),
    { products_slug: ["name", "A product already uses this URL slug."], products_sku: ["name", "A product already uses this SKU."] },
  );
  afterCatalogChange(tagsOf(result.slugs));
  res.status(201).json(result.view);
});
