import { eq, or } from "drizzle-orm";
import { adminUsers, customers, enquiries, enquiryNotes, type EnquirySource, type EnquiryStatus, type EnquiryType } from "@/db/schema";
import { zEmail, zMobile } from "@/lib/validation";
import { documentNumbers } from "@/services/sequences";
import type { RowReader } from "../reader";
import { defineImport, type ImportColumn, type RowPlan } from "../types";

/**
 * LEADS & ENQUIRIES BULK IMPORT
 * ------------------------------------------------------------------
 * Import prospect and customer leads from exhibitions, Instagram, marketing
 * campaigns, call lists and WhatsApp outreach into the CRM pipeline.
 */

function readEmail(row: RowReader, key: string) {
  const value = row.text(key, { max: 160 });
  if (!value) return undefined;
  const parsed = zEmail.safeParse(value);
  if (!parsed.success) {
    row.error(key, "Enter a valid email address.");
    return undefined;
  }
  return parsed.data;
}

function readMobile(row: RowReader, key: string) {
  const value = row.text(key, { max: 20 });
  if (!value) return undefined;
  const parsed = zMobile.safeParse(value);
  if (!parsed.success) {
    row.error(key, "Enter a valid 10-digit mobile number.");
    return undefined;
  }
  return parsed.data;
}

const SOURCES: EnquirySource[] = [
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
];

const leadColumns: ImportColumn[] = [
  { key: "name", label: "Name", required: true, example: "Priya Sharma", example2: "Vikas Patel", hint: "Full name of the prospect/customer." },
  { key: "mobile", label: "Mobile", required: true, example: "9876543210", example2: "9825012345", hint: "10-digit Indian mobile number." },
  { key: "email", label: "Email", example: "priya@example.com", example2: "", hint: "Optional email address." },
  {
    key: "source",
    label: "Source",
    example: "exhibition",
    example2: "instagram",
    hint: "whatsapp, phone, walk_in, instagram, facebook_ads, google_ads, referral, exhibition, cold_outreach, b2b_catalog, website_form, other. Defaults to exhibition.",
  },
  { key: "type", label: "Enquiry Type", example: "custom_jewellery", example2: "contact", hint: "product, custom_jewellery, contact. Defaults to contact." },
  { key: "message", label: "Requirement / Message", example: "Interested in silver bridal set", example2: "925 silver coins 50g", hint: "Requirement details or initial message." },
  { key: "jewelleryType", label: "Jewellery Type", example: "Bangle", example2: "Coin", hint: "e.g. Ring, Necklace, Bangle, Coin, Silver Bar, Anklet." },
  { key: "budgetRange", label: "Budget Range", example: "25k-50k", example2: "10k-25k", hint: "Approximate budget or price expectation." },
  { key: "preferredMetal", label: "Metal", example: "Silver", example2: "Gold", hint: "Silver, Gold, Platinum." },
  { key: "preferredPurity", label: "Purity", example: "925", example2: "999", hint: "e.g. 925, 999, 22KT." },
  { key: "preferredContact", label: "Preferred Contact", example: "whatsapp", example2: "phone", hint: "whatsapp, phone, or email." },
  { key: "status", label: "Status", example: "new", example2: "in_progress", hint: "new, in_progress, responded, closed. Defaults to new." },
  { key: "assignedToEmail", label: "Assignee Email", example: "admin@abhisheksilver.com", example2: "", hint: "Email of active team member to assign this lead to." },
  { key: "notes", label: "Initial Note", example: "Met at Delhi Jewellery Expo booth 42", example2: "Follow up on WhatsApp", hint: "Optional internal note added to enquiry timeline." },
];

interface LeadImportState {
  seen: Map<string, number>;
  assignees: Map<string, string>;
}

interface LeadPlan extends RowPlan {
  values: {
    type: EnquiryType;
    source: EnquirySource;
    name: string;
    mobile: string;
    email: string;
    message: string;
    jewelleryType: string | null;
    budgetRange: string | null;
    preferredMetal: string | null;
    preferredPurity: string | null;
    preferredContact: "phone" | "whatsapp" | "email" | null;
    status: EnquiryStatus;
    assignedToAdminId: string | null;
    customerId: string | null;
  };
  note: string | null;
}

export const leadImport = defineImport<LeadImportState, LeadPlan>({
  entity: "leads",
  label: "Leads & Enquiries",
  description: "Bulk import prospective customer leads from exhibitions, Instagram ads, trade directories, call campaigns and WhatsApp lists.",
  module: "enquiries",
  permission: "enquiries:manage",
  columns: leadColumns,

  async prepare(ctx) {
    const admins = await ctx.ex
      .select({ id: adminUsers.id, email: adminUsers.email })
      .from(adminUsers)
      .where(eq(adminUsers.status, "active"));
    const assignees = new Map<string, string>();
    for (const a of admins) assignees.set(a.email.toLowerCase(), a.id);
    return { seen: new Map<string, number>(), assignees };
  },

  async plan(row, state, ctx) {
    const name = row.text("name", { required: true, max: 120 });
    const mobile = readMobile(row, "mobile");
    const email = readEmail(row, "email");
    const rawSource = row.choice("source", SOURCES) ?? "exhibition";
    const rawType = row.choice("type", ["product", "custom_jewellery", "contact"] as const) ?? "contact";
    const message = row.text("message", { max: 3000 }) || "Imported lead";
    const jewelleryType = row.text("jewelleryType", { max: 80 });
    const budgetRange = row.text("budgetRange", { max: 80 });
    const preferredMetal = row.text("preferredMetal", { max: 40 });
    const preferredPurity = row.text("preferredPurity", { max: 40 });
    const preferredContact = row.choice("preferredContact", ["phone", "whatsapp", "email"] as const) ?? null;
    const status = row.choice("status", ["new", "in_progress", "responded", "closed"] as const) ?? "new";
    const assignedEmail = row.text("assignedToEmail", { max: 160 });
    const note = row.text("notes", { max: 2000 });

    if (!mobile) row.error("mobile", "A valid 10-digit mobile number is required.");
    if (!name || !row.ok) return null;

    // Check duplicate mobile in same spreadsheet
    const seenRow = state.seen.get(mobile!);
    if (seenRow) {
      row.error("mobile", `Mobile ${mobile} appears more than once (already on row ${seenRow}).`);
      return null;
    }
    state.seen.set(mobile!, row.number);

    let assignedToAdminId = ctx.actor.adminId;
    if (assignedEmail) {
      const matched = state.assignees.get(assignedEmail.toLowerCase());
      if (matched) {
        assignedToAdminId = matched;
      } else {
        row.error("assignedToEmail", `No active team member found with email "${assignedEmail}".`);
      }
    }
    if (!row.ok) return null;

    // Check if customer already exists for this mobile or email
    const [existingCustomer] = await ctx.ex
      .select({ id: customers.id })
      .from(customers)
      .where(or(eq(customers.phone, mobile!), email ? eq(customers.email, email) : undefined))
      .limit(1);

    return {
      row: row.number,
      action: "create",
      summary: `${name} (${mobile}) — ${rawSource} lead`,
      values: {
        type: rawType,
        source: rawSource,
        name,
        mobile: mobile!,
        email: email ?? "",
        message,
        jewelleryType: jewelleryType ?? null,
        budgetRange: budgetRange ?? null,
        preferredMetal: preferredMetal ?? null,
        preferredPurity: preferredPurity ?? null,
        preferredContact,
        status,
        assignedToAdminId,
        customerId: existingCustomer?.id ?? null,
      },
      note: note ?? null,
    };
  },

  async apply(plan, _state, ctx) {
    const reference = await documentNumbers.enquiry(ctx.tx);
    const [created] = await ctx.tx
      .insert(enquiries)
      .values({
        reference,
        type: plan.values.type,
        source: plan.values.source,
        name: plan.values.name,
        mobile: plan.values.mobile,
        email: plan.values.email,
        message: plan.values.message,
        jewelleryType: plan.values.jewelleryType,
        budgetRange: plan.values.budgetRange,
        preferredMetal: plan.values.preferredMetal,
        preferredPurity: plan.values.preferredPurity,
        preferredContact: plan.values.preferredContact,
        status: plan.values.status,
        assignedToAdminId: plan.values.assignedToAdminId,
        customerId: plan.values.customerId,
      })
      .returning();

    if (plan.note && created) {
      await ctx.tx.insert(enquiryNotes).values({
        enquiryId: created.id,
        body: plan.note,
        authorName: ctx.actor.name,
      });
    }
  },
});
