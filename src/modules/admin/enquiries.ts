import { and, asc, count, desc, eq, isNull, or, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { db } from "@/db/client";
import { adminUsers, customers, enquiries, enquiryContactLogs, enquiryNotes, products } from "@/db/schema";
import { adminOf, can, requirePermission } from "@/http/auth";
import { invalid, notFound } from "@/lib/errors";
import { paginated, parse, zDate, zEmail, zMobile, zText, zUuid } from "@/lib/validation";
import { customerName } from "@/services/customers";
import { actorOf, recordAudit } from "@/services/audit";
import { documentNumbers } from "@/services/sequences";
import { idParam, listQuery, searchAny, sortBy, withinDates } from "./helpers";

export const enquiriesAdminRouter = Router();

const STATUSES = ["new", "in_progress", "responded", "closed"] as const;

enquiriesAdminRouter.get("/enquiries/assignees", requirePermission("enquiries:manage"), async (_req, res) => {
  res.json(
    await db()
      .select({ id: adminUsers.id, name: adminUsers.name })
      .from(adminUsers)
      .where(eq(adminUsers.status, "active"))
      .orderBy(asc(adminUsers.name)),
  );
});

enquiriesAdminRouter.get("/enquiries", requirePermission("enquiries:view"), async (req, res) => {
  const query = parse(
    listQuery.extend({
      status: z.enum(STATUSES).optional(),
      type: z.enum(["product", "custom_jewellery", "contact"]).optional(),
      source: z
        .enum([
          "website_form",
          "product_page",
          "custom_jewellery",
          "whatsapp",
          "phone",
          "walk_in",
          "instagram",
          "facebook_ads",
          "google_ads",
          "referral",
          "exhibition",
          "cold_outreach",
          "b2b_catalog",
          "other",
        ])
        .optional(),
      /** An admin id, "me" or "unassigned". */
      assignedTo: z.string().max(40).optional(),
      from: zDate.optional(),
      to: zDate.optional(),
    }),
    req.query,
  );
  const admin = adminOf(req);
  const assigned =
    query.assignedTo === "unassigned"
      ? isNull(enquiries.assignedToAdminId)
      : query.assignedTo === "me"
        ? eq(enquiries.assignedToAdminId, admin.id)
        : query.assignedTo && /^[0-9a-f-]{36}$/i.test(query.assignedTo)
          ? eq(enquiries.assignedToAdminId, query.assignedTo)
          : undefined;
  const where = and(
    query.status ? eq(enquiries.status, query.status) : undefined,
    query.type ? eq(enquiries.type, query.type) : undefined,
    query.source ? eq(enquiries.source, query.source) : undefined,
    assigned,
    ...withinDates(enquiries.createdAt, query.from, query.to),
    searchAny(query.q, [enquiries.reference, enquiries.name, enquiries.mobile, enquiries.email, sql`${enquiries.product} ->> 'name'`]),
  );
  const rows = await db()
    .select({
      id: enquiries.id,
      reference: enquiries.reference,
      type: enquiries.type,
      source: enquiries.source,
      name: enquiries.name,
      mobile: enquiries.mobile,
      email: enquiries.email,
      product: enquiries.product,
      status: enquiries.status,
      assignedTo: adminUsers.name,
      assignedToAdminId: enquiries.assignedToAdminId,
      customerId: enquiries.customerId,
      createdAt: enquiries.createdAt,
      updatedAt: enquiries.updatedAt,
    })
    .from(enquiries)
    .leftJoin(adminUsers, eq(adminUsers.id, enquiries.assignedToAdminId))
    .where(where)
    .orderBy(sortBy(query.sort, { createdAt: enquiries.createdAt, updatedAt: enquiries.updatedAt }, desc(enquiries.createdAt)))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);
  const [total] = await db().select({ value: count() }).from(enquiries).where(where);
  const statusCounts = await db().select({ status: enquiries.status, value: count() }).from(enquiries).groupBy(enquiries.status);
  res.json({ ...paginated(rows, total?.value ?? 0, query.page, query.pageSize), statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s.value])) });
});

async function enquiryDetail(id: string, withCustomer: boolean) {
  const [row] = await db()
    .select({ enquiry: enquiries, assignedTo: adminUsers.name })
    .from(enquiries)
    .leftJoin(adminUsers, eq(adminUsers.id, enquiries.assignedToAdminId))
    .where(eq(enquiries.id, id))
    .limit(1);
  if (!row) throw notFound("Enquiry not found.");
  const notes = await db().select().from(enquiryNotes).where(eq(enquiryNotes.enquiryId, id)).orderBy(desc(enquiryNotes.createdAt));
  const contacts = await db().select().from(enquiryContactLogs).where(eq(enquiryContactLogs.enquiryId, id)).orderBy(desc(enquiryContactLogs.createdAt));

  let customer = null;
  if (withCustomer) {
    const e = row.enquiry;
    const [match] = await db()
      .select()
      .from(customers)
      .where(e.customerId ? eq(customers.id, e.customerId) : or(eq(customers.phone, e.mobile), e.email ? eq(sql`lower(${customers.email})`, e.email.toLowerCase()) : undefined))
      .limit(1);
    if (match) customer = { id: match.id, customerCode: match.customerCode, name: customerName(match), linked: match.id === e.customerId };
  }
  return {
    ...row.enquiry,
    attachments: row.enquiry.attachments.map(({ path: _path, ...file }) => {
      void _path;
      return file;
    }),
    assignedTo: row.enquiry.assignedToAdminId ? { id: row.enquiry.assignedToAdminId, name: row.assignedTo } : null,
    customer,
    notes,
    contactHistory: contacts,
  };
}

enquiriesAdminRouter.get("/enquiries/:id", requirePermission("enquiries:view"), async (req, res) => {
  res.json(await enquiryDetail(idParam(req), can(req, "customers:view")));
});

/** Enquiries received through various online and offline channels. */
enquiriesAdminRouter.post("/enquiries", requirePermission("enquiries:manage"), async (req, res) => {
  const input = parse(
    z.object({
      type: z.enum(["product", "custom_jewellery", "contact"]),
      source: z.enum([
        "website_form",
        "product_page",
        "custom_jewellery",
        "whatsapp",
        "phone",
        "walk_in",
        "instagram",
        "facebook_ads",
        "google_ads",
        "referral",
        "exhibition",
        "cold_outreach",
        "b2b_catalog",
        "other",
      ]),
      name: zText(120),
      mobile: zMobile,
      email: zEmail.optional().or(z.literal("")),
      message: zText(3000),
      productId: zUuid.optional(),
      jewelleryType: z.string().trim().max(80).optional(),
      budgetRange: z.string().trim().max(80).optional(),
      preferredMetal: z.string().trim().max(40).optional(),
      preferredPurity: z.string().trim().max(40).optional(),
      preferredContact: z.enum(["phone", "whatsapp", "email"]).optional(),
      customerId: zUuid.optional(),
      assignedToAdminId: zUuid.optional(),
      status: z.enum(STATUSES).optional(),
      notes: z.string().trim().max(2000).optional(),
    }),
    req.body,
  );
  let product: { id: string; name: string; sku: string } | null = null;
  if (input.productId) {
    const [row] = await db().select({ id: products.id, name: products.name, sku: products.sku }).from(products).where(eq(products.id, input.productId)).limit(1);
    if (!row) throw invalid({ productId: "Choose an existing product." });
    product = row;
  }
  if (input.customerId) {
    const [row] = await db().select({ id: customers.id }).from(customers).where(eq(customers.id, input.customerId)).limit(1);
    if (!row) throw invalid({ customerId: "Choose an existing customer." });
  }

  const actor = actorOf(req);
  let assignedAdminId = input.assignedToAdminId ?? actor.adminId;
  if (input.assignedToAdminId) {
    const [assignee] = await db()
      .select({ id: adminUsers.id })
      .from(adminUsers)
      .where(and(eq(adminUsers.id, input.assignedToAdminId), eq(adminUsers.status, "active")))
      .limit(1);
    if (!assignee) throw invalid({ assignedToAdminId: "Choose an active team member." });
    assignedAdminId = assignee.id;
  }

  const enquiry = await db().transaction(async (tx) => {
    const [row] = await tx
      .insert(enquiries)
      .values({
        reference: await documentNumbers.enquiry(tx),
        type: input.type,
        source: input.source,
        customerId: input.customerId ?? null,
        name: input.name,
        mobile: input.mobile,
        email: input.email || "",
        message: input.message,
        product,
        jewelleryType: input.jewelleryType || null,
        budgetRange: input.budgetRange || null,
        preferredMetal: input.preferredMetal || null,
        preferredPurity: input.preferredPurity || null,
        preferredContact: input.preferredContact ?? null,
        assignedToAdminId: assignedAdminId,
        status: input.status ?? "in_progress",
      })
      .returning();

    if (input.notes) {
      await tx.insert(enquiryNotes).values({
        enquiryId: row!.id,
        body: input.notes,
        authorName: actor.name,
      });
    }

    await recordAudit(tx, actor, { module: "enquiries", action: "enquiry.create_manual", entityType: "enquiry", entityId: row!.id, entityLabel: row!.reference });
    return row!;
  });
  res.status(201).json(await enquiryDetail(enquiry.id, can(req, "customers:view")));
});

/** Bulk create leads via direct JSON batch */
enquiriesAdminRouter.post("/enquiries/bulk", requirePermission("enquiries:manage"), async (req, res) => {
  const { leads: rawLeads } = parse(
    z.object({
      leads: z
        .array(
          z.object({
            type: z.enum(["product", "custom_jewellery", "contact"]).default("contact"),
            source: z
              .enum([
                "website_form",
                "product_page",
                "custom_jewellery",
                "whatsapp",
                "phone",
                "walk_in",
                "instagram",
                "facebook_ads",
                "google_ads",
                "referral",
                "exhibition",
                "cold_outreach",
                "b2b_catalog",
                "other",
              ])
              .default("exhibition"),
            name: zText(120),
            mobile: zMobile,
            email: zEmail.optional().or(z.literal("")),
            message: z.string().trim().max(3000).optional(),
            jewelleryType: z.string().trim().max(80).optional(),
            budgetRange: z.string().trim().max(80).optional(),
            preferredMetal: z.string().trim().max(40).optional(),
            preferredPurity: z.string().trim().max(40).optional(),
            preferredContact: z.enum(["phone", "whatsapp", "email"]).optional(),
            assignedToAdminId: zUuid.optional(),
            status: z.enum(STATUSES).optional(),
            notes: z.string().trim().max(2000).optional(),
          }),
        )
        .min(1)
        .max(500),
    }),
    req.body,
  );

  const actor = actorOf(req);
  const results = await db().transaction(async (tx) => {
    const created: Array<{ id: string; reference: string; name: string; mobile: string }> = [];
    for (const lead of rawLeads) {
      const ref = await documentNumbers.enquiry(tx);
      const [row] = await tx
        .insert(enquiries)
        .values({
          reference: ref,
          type: lead.type,
          source: lead.source,
          name: lead.name,
          mobile: lead.mobile,
          email: lead.email || "",
          message: lead.message || "Bulk imported lead",
          jewelleryType: lead.jewelleryType || null,
          budgetRange: lead.budgetRange || null,
          preferredMetal: lead.preferredMetal || null,
          preferredPurity: lead.preferredPurity || null,
          preferredContact: lead.preferredContact ?? null,
          assignedToAdminId: lead.assignedToAdminId ?? actor.adminId,
          status: lead.status ?? "new",
        })
        .returning();

      if (lead.notes && row) {
        await tx.insert(enquiryNotes).values({
          enquiryId: row.id,
          body: lead.notes,
          authorName: actor.name,
        });
      }
      if (row) created.push({ id: row.id, reference: row.reference, name: row.name, mobile: row.mobile });
    }

    await recordAudit(tx, actor, {
      module: "enquiries",
      action: "enquiry.bulk_import",
      entityType: "enquiry",
      entityId: created[0]?.id ?? "bulk",
      entityLabel: `${created.length} leads imported`,
      after: { count: created.length },
    });
    return created;
  });

  res.status(201).json({ success: true, count: results.length, leads: results });
});

enquiriesAdminRouter.patch("/enquiries/:id", requirePermission("enquiries:manage"), async (req, res) => {
  const id = idParam(req);
  const patch = parse(
    z.object({
      status: z.enum(STATUSES).optional(),
      assignedToAdminId: zUuid.nullable().optional(),
      customerId: zUuid.nullable().optional(),
    }),
    req.body,
  );
  if (patch.customerId !== undefined && !can(req, "customers:view")) throw invalid({ customerId: "You don't have access to customers." });
  const actor = actorOf(req);
  await db().transaction(async (tx) => {
    const [current] = await tx.select().from(enquiries).where(eq(enquiries.id, id)).for("update");
    if (!current) throw notFound();
    if (patch.assignedToAdminId) {
      const [assignee] = await tx.select({ id: adminUsers.id }).from(adminUsers).where(and(eq(adminUsers.id, patch.assignedToAdminId), eq(adminUsers.status, "active"))).limit(1);
      if (!assignee) throw invalid({ assignedToAdminId: "Choose an active team member." });
    }
    if (patch.customerId) {
      const [customer] = await tx.select({ id: customers.id }).from(customers).where(eq(customers.id, patch.customerId)).limit(1);
      if (!customer) throw invalid({ customerId: "Choose an existing customer." });
    }
    await tx
      .update(enquiries)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(enquiries.id, id));
    await recordAudit(tx, actor, {
      module: "enquiries",
      action: "enquiry.update",
      entityType: "enquiry",
      entityId: id,
      entityLabel: current.reference,
      before: { status: current.status, assignedToAdminId: current.assignedToAdminId, customerId: current.customerId },
      after: patch,
    });
  });
  res.json(await enquiryDetail(id, can(req, "customers:view")));
});

enquiriesAdminRouter.post("/enquiries/:id/notes", requirePermission("enquiries:manage"), async (req, res) => {
  const id = idParam(req);
  const { body } = parse(z.object({ body: zText(2000) }), req.body);
  const [enquiry] = await db().select({ id: enquiries.id }).from(enquiries).where(eq(enquiries.id, id)).limit(1);
  if (!enquiry) throw notFound();
  await db().insert(enquiryNotes).values({ enquiryId: id, body, authorName: adminOf(req).name });
  res.status(201).json(await enquiryDetail(id, can(req, "customers:view")));
});

enquiriesAdminRouter.post("/enquiries/:id/contacts", requirePermission("enquiries:manage"), async (req, res) => {
  const id = idParam(req);
  const input = parse(
    z.object({
      channel: z.enum(["phone", "whatsapp", "email", "in_person"]),
      outcome: zText(200),
      note: z.string().trim().max(1000).optional(),
    }),
    req.body,
  );
  await db().transaction(async (tx) => {
    const [enquiry] = await tx.select().from(enquiries).where(eq(enquiries.id, id)).for("update");
    if (!enquiry) throw notFound();
    await tx.insert(enquiryContactLogs).values({ enquiryId: id, ...input, note: input.note || null, authorName: adminOf(req).name });
    // First contact moves a new enquiry into progress.
    if (enquiry.status === "new") await tx.update(enquiries).set({ status: "in_progress", updatedAt: new Date() }).where(eq(enquiries.id, id));
    else await tx.update(enquiries).set({ updatedAt: new Date() }).where(eq(enquiries.id, id));
  });
  res.status(201).json(await enquiryDetail(id, can(req, "customers:view")));
});
