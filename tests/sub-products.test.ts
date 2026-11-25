import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminToken, setupApp } from "./helpers";

/**
 * SUB-PRODUCTS
 * ------------------------------------------------------------------
 * The owner only works with products: a main product gets sub-products from its
 * own page. The hidden parent_products row appears with the first sub-product
 * and goes with the last one.
 */

type Ctx = Awaited<ReturnType<typeof setupApp>>;
let ctx: Ctx;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

interface Item {
  productId: string;
  sku: string;
  name: string;
  slug: string;
  image: { url: string } | null;
  price: number | null;
  stock: number;
  status: string;
}
interface View {
  main: { id: string; sku: string; name: string; image: { url: string } | null };
  belongsTo: { id: string; sku: string; name: string } | null;
  items: Item[];
}
interface Variant {
  id: string;
  sku: string;
  name: string;
  label: string;
  price: number;
}

let superAdmin = "";
const ids: Record<string, string> = {};
const slugs: Record<string, string> = {};
const names: Record<string, string> = {};
const prices: Record<string, number> = {};
let baselineRings = 0;
let groupSlug = "";
let quickCreatedId = "";

/** MAIN gets the sub-products; OTHER is a second main product for the move case. */
const SKUS = { MAIN: "G22K-RG-1001", SUB1: "S925-RG-2034", SUB2: "G18K-RG-1002", OTHER: "G22K-RG-1004" } as const;

const subProducts = (productId: string, token = superAdmin) => ctx.api().get(`/v1/admin/products/${productId}/sub-products`).set(auth(token));
const replace = (productId: string, body: object, token = superAdmin) => ctx.api().put(`/v1/admin/products/${productId}/sub-products`).set(auth(token)).send(body);
const quickCreate = (productId: string, body: object, token = superAdmin) => ctx.api().post(`/v1/admin/products/${productId}/sub-products`).set(auth(token)).send(body);

async function listing(query: string) {
  const response = await ctx.api().get(`/v1/products?${query}`);
  expect(response.status).toBe(200);
  return response.body as { items: { id: string; name: string; parent: { id: string; name: string; variantCount: number } | null }[]; total: number };
}

beforeAll(async () => {
  ctx = await setupApp();
  superAdmin = await adminToken(ctx.app, "superadmin@example.com");
  for (const [key, sku] of Object.entries(SKUS)) {
    const found = await ctx.api().get(`/v1/admin/products?q=${sku}`).set(auth(superAdmin));
    const row = found.body.items.find((item: { sku: string }) => item.sku === sku);
    ids[key] = row.id;
    slugs[key] = row.slug;
    names[key] = row.name;
    prices[key] = (await ctx.api().get(`/v1/products/${row.slug}`)).body.finalPrice;
  }
  baselineRings = (await listing("category=rings&pageSize=48")).total;
}, 180_000);

afterAll(async () => {
  await ctx?.connection.close();
});

describe("sub-products — the group behind a main product", () => {
  it("has no sub-products to start with", async () => {
    const response = await subProducts(ids.MAIN!);
    expect(response.status).toBe(200);
    const view = response.body as View;
    expect(view).toMatchObject({ main: { id: ids.MAIN, sku: SKUS.MAIN, name: names.MAIN }, belongsTo: null, items: [] });
    expect(view.main.image!.url).toBeTruthy();
  });

  it("creates the group from the main product's details when the first sub-product is added", async () => {
    const response = await replace(ids.MAIN!, { items: [{ productId: ids.SUB1 }] });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const view = response.body as View;
    expect(view.main).toMatchObject({ id: ids.MAIN, sku: SKUS.MAIN, name: names.MAIN });
    expect(view.belongsTo).toBeNull();
    expect(view.items).toHaveLength(1);
    expect(view.items[0]).toMatchObject({ productId: ids.SUB1, sku: SKUS.SUB1, name: names.SUB1, slug: slugs.SUB1, status: "active", price: prices.SUB1 });
    expect(view.items[0]!.stock).toBeGreaterThan(0);

    // The website now shows one card, the main product's, with both products as options.
    const all = await listing("category=rings&pageSize=48");
    expect(all.total).toBe(baselineRings - 1);
    const cards = all.items.filter((item) => item.parent);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: ids.MAIN, name: names.MAIN, parent: { name: names.MAIN, variantCount: 2 } });

    const detail = await ctx.api().get(`/v1/products/${slugs.SUB1}`);
    expect(detail.status).toBe(200);
    // A sub-product's page shows the main product's details, but keeps its own price.
    expect(detail.body).toMatchObject({ id: ids.SUB1, name: names.MAIN, sku: SKUS.SUB1, finalPrice: prices.SUB1 });
    groupSlug = detail.body.parent.slug;
    expect(detail.body.parent).toMatchObject({ name: names.MAIN });
    expect((detail.body.variants as Variant[]).map((variant) => [variant.id, variant.name, variant.label, variant.price])).toEqual([
      [ids.MAIN, names.MAIN, names.MAIN, prices.MAIN],
      [ids.SUB1, names.SUB1, names.SUB1, prices.SUB1],
    ]);

    const audit = await ctx.api().get(`/v1/admin/audit-logs?entityId=${ids.MAIN}`).set(auth(superAdmin));
    expect(audit.body.items.map((entry: { action: string }) => entry.action)).toContain("product.sub_products");
  });

  it("returns belongsTo on a sub-product and refuses to edit the group there", async () => {
    const response = await subProducts(ids.SUB1!);
    expect(response.status).toBe(200);
    const view = response.body as View;
    expect(view.main).toMatchObject({ id: ids.SUB1, sku: SKUS.SUB1, name: names.SUB1 });
    expect(view.belongsTo).toEqual({ id: ids.MAIN, sku: SKUS.MAIN, name: names.MAIN });
    expect(view.items).toEqual([]);

    const attempt = await replace(ids.SUB1!, { items: [{ productId: ids.SUB2 }] });
    expect(attempt.status).toBe(422);
    expect(attempt.body.message).toContain("sub-product");
  });

  it("quick-creates a sub-product with the same specs and the same price", async () => {
    const response = await quickCreate(ids.MAIN!, { name: "Aaravi Filigree Band — Rose Photo", images: [{ url: "https://example.com/rose.jpg", alt: "Rose" }] });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const view = response.body as View;
    expect(view.items.map((item) => item.name)).toEqual([names.SUB1, "Aaravi Filigree Band — Rose Photo"]);
    const created = view.items[1]!;
    quickCreatedId = created.productId;
    expect(created.price).toBe(prices.MAIN); // same size, same price — only the photo differs
    expect(created.sku.startsWith(`${SKUS.MAIN}-`)).toBe(true);
    expect(created.slug).toBe("aaravi-filigree-band-rose-photo");
    expect(created.image!.url).toBe("https://example.com/rose.jpg");
    expect(created.status).toBe("active");

    const main = await ctx.api().get(`/v1/admin/products/${ids.MAIN}`).set(auth(superAdmin));
    const product = await ctx.api().get(`/v1/admin/products/${created.productId}`).set(auth(superAdmin));
    expect(product.body).toMatchObject({
      categoryId: main.body.categoryId,
      subcategoryId: main.body.subcategoryId,
      metal: main.body.metal,
      purity: main.body.purity,
      gender: main.body.gender,
      netWeight: main.body.netWeight,
      makingType: main.body.makingType,
      makingValue: main.body.makingValue,
      stoneCharges: main.body.stoneCharges,
      otherCharges: main.body.otherCharges,
      sizing: main.body.sizing,
      sizeOptions: main.body.sizeOptions,
      status: main.body.status,
      collectionIds: main.body.collectionIds,
      parent: { name: names.MAIN },
      variantLabel: "Aaravi Filigree Band — Rose Photo",
    });

    // Overriding the weight moves the price.
    const heavier = await quickCreate(ids.MAIN!, {
      name: "Aaravi Filigree Band — Heavier",
      images: [{ url: "https://example.com/heavy.jpg", alt: "Heavy" }],
      netWeight: main.body.netWeight + 2,
    });
    expect(heavier.status, JSON.stringify(heavier.body)).toBe(201);
    const heavierItem = (heavier.body as View).items[2]!;
    expect(heavierItem.price!).toBeGreaterThan(prices.MAIN!);
    // Put the group back to two sub-products.
    const trimmed = await replace(ids.MAIN!, { items: [{ productId: ids.SUB1 }, { productId: quickCreatedId }] });
    expect(trimmed.status).toBe(200);
    expect((trimmed.body as View).items).toHaveLength(2);
  });

  it("rejects two products in one group with the same name", async () => {
    const clash = await quickCreate(ids.MAIN!, { name: names.MAIN!, images: [{ url: "https://example.com/x.jpg", alt: "" }] });
    expect(clash.status).toBe(422);
    expect(clash.body.fieldErrors.name).toContain(SKUS.MAIN);

    // Two candidates that happen to share a name can't both join.
    const renamed = await ctx.api().patch(`/v1/admin/products/${ids.OTHER}`).set(auth(superAdmin)).send({ name: names.SUB2 });
    expect(renamed.status).toBe(200);
    const both = await replace(ids.MAIN!, { items: [{ productId: ids.SUB2 }, { productId: ids.OTHER }] });
    expect(both.status).toBe(422);
    expect(both.body.fieldErrors["items.1"]).toContain(names.SUB2);
    expect(both.body.fieldErrors["items.1"]).toContain(SKUS.SUB2);
    expect((await ctx.api().patch(`/v1/admin/products/${ids.OTHER}`).set(auth(superAdmin)).send({ name: names.OTHER })).status).toBe(200);

    // Nothing was written: the group still holds the two it had.
    expect(((await subProducts(ids.MAIN!)).body as View).items.map((item) => item.productId)).toEqual([ids.SUB1, quickCreatedId]);

    const missing = await replace(ids.MAIN!, { items: [{ productId: ids.SUB1 }, { productId: "nope" }] });
    expect(missing.status).toBe(422);
    expect(Object.keys(missing.body.fieldErrors)).toEqual(["items.1"]);
    const twice = await replace(ids.MAIN!, { items: [{ productId: ids.SUB1 }, { productId: ids.SUB1 }] });
    expect(twice.status).toBe(422);
    expect(twice.body.fieldErrors["items.1"]).toContain("more than once");
    const itself = await replace(ids.MAIN!, { items: [{ productId: ids.MAIN }] });
    expect(itself.status).toBe(422);
    expect(itself.body.fieldErrors["items.0"]).toContain("main product");
  });

  it("copies the main product's edits to the group, so the website follows", async () => {
    const patch = await ctx
      .api()
      .patch(`/v1/admin/products/${ids.MAIN}`)
      .set(auth(superAdmin))
      .send({
        name: "Aaravi Heritage Gold Band",
        shortDescription: "Renamed on the main product.",
        description: "The main product's description is the group's description.",
        images: [{ url: "https://example.com/aaravi-new.jpg", alt: "Aaravi" }],
        seo: { title: "Aaravi Heritage Gold Band" },
      });
    expect(patch.status, JSON.stringify(patch.body)).toBe(200);

    const detail = await ctx.api().get(`/v1/products/${slugs.SUB1}`);
    expect(detail.body).toMatchObject({
      name: "Aaravi Heritage Gold Band",
      shortDescription: "Renamed on the main product.",
      description: "The main product's description is the group's description.",
      parent: { slug: groupSlug, name: "Aaravi Heritage Gold Band" },
    });
    expect(detail.body.seo.title).toBe("Aaravi Heritage Gold Band");
    // The sub-product keeps its own photos; the main product's cover the rest of the group.
    expect((await ctx.api().get(`/v1/products/${groupSlug}`)).body.images[0].url).toBe("https://example.com/aaravi-new.jpg");
    const variants = detail.body.variants as Variant[];
    expect(variants.map((variant) => [variant.name, variant.label])).toEqual([
      ["Aaravi Heritage Gold Band", "Aaravi Heritage Gold Band"],
      [names.SUB1, names.SUB1],
      ["Aaravi Filigree Band — Rose Photo", "Aaravi Filigree Band — Rose Photo"],
    ]);
    names.MAIN = "Aaravi Heritage Gold Band";
    expect(((await subProducts(ids.MAIN!)).body as View).main.name).toBe(names.MAIN);
  });

  it("takes a sub-product from another main product when move is set", async () => {
    const second = await replace(ids.OTHER!, { items: [{ productId: ids.SUB2 }] });
    expect(second.status, JSON.stringify(second.body)).toBe(200);

    const taken = await replace(ids.MAIN!, { items: [{ productId: ids.SUB1 }, { productId: quickCreatedId }, { productId: ids.SUB2 }] });
    expect(taken.status).toBe(422);
    expect(taken.body.fieldErrors["items.2"]).toContain(names.OTHER);

    const moved = await replace(ids.MAIN!, { items: [{ productId: ids.SUB1 }, { productId: quickCreatedId }, { productId: ids.SUB2 }], move: true });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    expect((moved.body as View).items.map((item) => item.productId)).toEqual([ids.SUB1, quickCreatedId, ids.SUB2]);

    // The group it left held nothing else, so that group is gone again.
    const source = await subProducts(ids.OTHER!);
    expect(source.body).toMatchObject({ belongsTo: null, items: [] });
    expect((await ctx.api().get(`/v1/admin/products/${ids.OTHER}`).set(auth(superAdmin))).body).toMatchObject({ parent: null, variantLabel: null });
    expect((await ctx.api().get(`/v1/products/${slugs.OTHER}`)).body).toMatchObject({ name: names.OTHER, parent: null, variants: [] });
  });

  it("deletes the group when the last sub-product is removed", async () => {
    const response = await replace(ids.MAIN!, { items: [] });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ main: { id: ids.MAIN, name: names.MAIN }, belongsTo: null, items: [] });

    for (const key of ["MAIN", "SUB1", "SUB2"] as const) {
      const product = await ctx.api().get(`/v1/admin/products/${ids[key]}`).set(auth(superAdmin));
      expect(product.body).toMatchObject({ parent: null, variantLabel: null, status: "active" });
    }
    const detail = await ctx.api().get(`/v1/products/${slugs.SUB1}`);
    expect(detail.body).toMatchObject({ name: names.SUB1, parent: null, variants: [] });
    expect((await ctx.api().get(`/v1/products/${groupSlug}`)).status).toBe(404);
    // Every product is its own card again (plus the two quick-created ones).
    expect((await listing("category=rings&pageSize=48")).total).toBe(baselineRings + 2);
  });

  it("enforces permissions", async () => {
    const sales = await adminToken(ctx.app, "sales@example.com"); // products:view only
    const inventory = await adminToken(ctx.app, "inventory@example.com"); // products:create, no edit_content
    const content = await adminToken(ctx.app, "content@example.com"); // create + edit_content

    expect((await subProducts(ids.MAIN!, sales)).status).toBe(200);
    expect((await replace(ids.MAIN!, { items: [{ productId: ids.SUB1 }] }, sales)).status).toBe(403);
    expect((await replace(ids.MAIN!, { items: [{ productId: ids.SUB1 }] }, inventory)).status).toBe(403);
    expect((await quickCreate(ids.MAIN!, { name: "No Permission", images: [] }, inventory)).status).toBe(403);
    expect((await ctx.api().get(`/v1/admin/products/${ids.MAIN}/sub-products`)).status).toBe(401);

    const allowed = await replace(ids.MAIN!, { items: [{ productId: ids.SUB1 }] }, content);
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(200);
    expect((allowed.body as View).items).toHaveLength(1);
    expect((await replace(ids.MAIN!, { items: [] }, content)).status).toBe(200);
  });

  it("copies imported changes to the group as well", async () => {
    expect((await replace(ids.MAIN!, { items: [{ productId: ids.SUB1 }] })).status).toBe(200);
    const csv = (rows: string[][]) =>
      Buffer.from(rows.map((row) => row.map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(",")).join("\r\n"), "utf8");
    const commit = await ctx
      .api()
      .post("/v1/admin/imports/products?mode=commit")
      .set(auth(superAdmin))
      .attach("file", csv([["SKU", "Name", "Short Description"], [SKUS.MAIN, "Aaravi Imported Band", "Imported on the main product."]]), {
        filename: "import.csv",
        contentType: "text/csv",
      });
    expect(commit.status, JSON.stringify(commit.body)).toBe(200);
    expect(commit.body).toMatchObject({ updated: 1 });

    const detail = await ctx.api().get(`/v1/products/${slugs.SUB1}`);
    expect(detail.body).toMatchObject({
      name: "Aaravi Imported Band",
      shortDescription: "Imported on the main product.",
      parent: { name: "Aaravi Imported Band" },
    });
    expect((await replace(ids.MAIN!, { items: [] })).status).toBe(200);
  });
});
