import { and, eq, isNull, ne } from "drizzle-orm";
import type { MetalType, PurityCode } from "@/contracts/common";
import type { Executor, Tx } from "@/db/client";
import { parentProductCollections, parentProducts, productCollections, products } from "@/db/schema";
import { invalid } from "@/lib/errors";
import { labelKey, variantLabelOf } from "@/modules/catalog/labels";

/**
 * PARENT PRODUCT RULES SHARED WITH THE PRODUCT SCREENS
 * ------------------------------------------------------------------
 * Kept apart from both routers so products and parent products can check
 * each other without importing each other.
 *
 * A "container" is a `parent_products` row. Since the shop owner only works
 * with products, the container is hidden: the **main product** is its default
 * variant and its other variants are that product's **sub-products**. The
 * container mirrors the main product's shared details, so the group a customer
 * sees is always the main product.
 */

/**
 * `/product/<slug>` must never be ambiguous, so parents and products share one
 * slug space. Returns the plain-English problem, or null when the slug is free.
 */
export async function slugConflict(ex: Executor, slug: string, except: { productId?: string; parentId?: string } = {}): Promise<string | null> {
  const [parent] = await ex
    .select({ name: parentProducts.name })
    .from(parentProducts)
    .where(and(eq(parentProducts.slug, slug), except.parentId ? ne(parentProducts.id, except.parentId) : undefined))
    .limit(1);
  if (parent) return `This URL slug is already used by the parent product “${parent.name}”.`;
  const [product] = await ex
    .select({ name: products.name, sku: products.sku })
    .from(products)
    .where(and(eq(products.slug, slug), except.productId ? ne(products.id, except.productId) : undefined))
    .limit(1);
  if (product) return `This URL slug is already used by the product “${product.name}” (${product.sku}).`;
  return null;
}

export function slugify(text: string) {
  return text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 150);
}

/** `base`, or `base-2`, `base-3`… — the first slug no parent or product uses yet (nor any in `reserved`). */
export async function uniqueSlug(ex: Executor, base: string, reserved: Set<string> = new Set()) {
  const start = base || "design";
  for (let suffix = 1; suffix < 200; suffix += 1) {
    const candidate = suffix === 1 ? start : `${start}-${suffix}`.slice(0, 160);
    if (!reserved.has(candidate) && !(await slugConflict(ex, candidate))) return candidate;
  }
  return `${start}-${Date.now().toString(36)}`;
}

export async function assertSlugFree(ex: Executor, slug: string, except: { productId?: string; parentId?: string } = {}) {
  const problem = await slugConflict(ex, slug, except);
  if (problem) throw invalid({ slug: problem });
}

/**
 * When a variant's metal or purity changes, its default label ("22K Gold")
 * changes too and must not clash with a sibling's label.
 */
export async function assertSiblingLabelFree(
  ex: Executor,
  product: { id: string; parentId: string | null; metal: MetalType; purity: PurityCode; variantCustomLabel: string | null },
) {
  if (!product.parentId) return;
  const label = variantLabelOf(product);
  const siblings = await ex
    .select({ metal: products.metal, purity: products.purity, variantCustomLabel: products.variantCustomLabel, sku: products.sku })
    .from(products)
    .where(and(eq(products.parentId, product.parentId), ne(products.id, product.id), isNull(products.deletedAt)));
  const clash = siblings.find((sibling) => labelKey(variantLabelOf(sibling)) === labelKey(label));
  if (!clash) return;
  const [parent] = await ex.select({ name: parentProducts.name }).from(parentProducts).where(eq(parentProducts.id, product.parentId)).limit(1);
  throw invalid({
    purity: `This product is a variant of “${parent?.name ?? "a parent product"}”, where ${clash.sku} is already labelled “${label}”. Give one of them a custom variant label first.`,
  });
}

/* ------------------------------------------------------------------ */
/* The hidden container behind a main product                          */
/* ------------------------------------------------------------------ */

type ProductRow = typeof products.$inferSelect;

/** Product fields the container copies from its main product. */
export const CONTAINER_FIELDS = ["name", "shortDescription", "description", "categoryId", "subcategoryId", "collectionIds", "images", "seo"] as const;
const CONTAINER_FIELD_SET = new Set<string>(CONTAINER_FIELDS);

/** True when a product patch touches something the container mirrors. */
export const touchesContainer = (fields: Iterable<string>) => [...fields].some((field) => CONTAINER_FIELD_SET.has(field));

export async function writeContainerCollections(tx: Tx, parentId: string, collectionIds: string[]) {
  await tx.delete(parentProductCollections).where(eq(parentProductCollections.parentId, parentId));
  const unique = [...new Set(collectionIds)];
  if (unique.length) await tx.insert(parentProductCollections).values(unique.map((collectionId) => ({ parentId, collectionId })));
}

const collectionsOf = async (ex: Executor, productId: string) =>
  (await ex.select({ id: productCollections.collectionId }).from(productCollections).where(eq(productCollections.productId, productId))).map((row) => row.id);

/** The shared details the container takes from its main product. */
const containerValues = (main: ProductRow) => ({
  name: main.name,
  shortDescription: main.shortDescription,
  description: main.description,
  categoryId: main.categoryId,
  subcategoryId: main.subcategoryId,
  images: main.images,
  seo: main.seo,
});

/**
 * Creates the hidden container for a main product that has none yet: its name,
 * descriptions, taxonomy, images and SEO are the main product's, and it is
 * active so the group shows on the website. The caller attaches the variants.
 */
export async function createContainerFor(tx: Tx, main: ProductRow) {
  const slug = await uniqueSlug(tx, slugify(main.name));
  const [row] = await tx
    .insert(parentProducts)
    .values({ ...containerValues(main), slug, status: "active", defaultVariantId: main.id })
    .returning();
  await writeContainerCollections(tx, row!.id, await collectionsOf(tx, main.id));
  return row!;
}

/** Removes the container; its products become standalone again. */
export async function deleteContainer(tx: Tx, parentId: string) {
  await tx.update(products).set({ parentId: null, variantCustomLabel: null, variantOrder: 0, updatedAt: new Date() }).where(eq(products.parentId, parentId));
  await tx.delete(parentProducts).where(eq(parentProducts.id, parentId));
}

/**
 * Copies a main product's shared details onto its container, so the group
 * always shows the main product. Does nothing for a standalone product or for
 * one that is only a sub-product. Returns the container's slug when it changed.
 */
export async function syncContainerFromMain(tx: Tx, productId: string): Promise<string | null> {
  const [main] = await tx
    .select()
    .from(products)
    .where(and(eq(products.id, productId), isNull(products.deletedAt)))
    .limit(1);
  if (!main?.parentId) return null;
  const [container] = await tx
    .select()
    .from(parentProducts)
    .where(and(eq(parentProducts.id, main.parentId), eq(parentProducts.defaultVariantId, main.id)))
    .limit(1);
  if (!container) return null;
  await tx
    .update(parentProducts)
    .set({ ...containerValues(main), updatedAt: new Date() })
    .where(eq(parentProducts.id, container.id));
  await writeContainerCollections(tx, container.id, await collectionsOf(tx, main.id));
  return container.slug;
}

/**
 * Inside a group a product's variant label is its own product name, so a rename
 * renames the option customers pick. Returns the label to store, or undefined
 * when this product's label isn't its name (a hand-written label is kept).
 */
export async function labelForRename(ex: Executor, current: ProductRow, nextName: string): Promise<string | undefined> {
  if (!current.parentId || current.variantCustomLabel !== current.name || nextName === current.name) return undefined;
  const siblings = await ex
    .select({ sku: products.sku, metal: products.metal, purity: products.purity, variantCustomLabel: products.variantCustomLabel })
    .from(products)
    .where(and(eq(products.parentId, current.parentId), ne(products.id, current.id), isNull(products.deletedAt)));
  const clash = siblings.find((sibling) => labelKey(variantLabelOf(sibling)) === labelKey(nextName));
  if (clash) throw invalid({ name: `${clash.sku} in this group is already called “${variantLabelOf(clash)}”. Give each product in a group a different name.` });
  return nextName;
}
