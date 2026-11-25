import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { count, eq } from "drizzle-orm";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";
import { createConnection, setConnection, db } from "../client";
import { seedDatabase } from "./index";
import {
  adminUsers,
  blogPosts,
  categories,
  collections,
  coupons,
  customerAddresses,
  customerNotes,
  customers,
  enquiries,
  enquiryContactLogs,
  enquiryNotes,
  expenseCategories,
  expenses,
  faqs,
  inventoryLevels,
  invoiceEvents,
  invoiceItems,
  invoicePayments,
  invoices,
  metalRates,
  offers,
  orderCommunications,
  orderItems,
  orderNotes,
  orderReturns,
  orderStatusEvents,
  orders,
  pricingHistory,
  productCollections,
  products,
  purchaseItems,
  purchases,
  recurringExpenses,
  refunds,
  saleItems,
  sales,
  stockLocations,
  stockMovements,
  subcategories,
  testimonials,
  vendors,
} from "../schema";
import type {
  AddressSnapshot,
  CustomizationKey,
  Gender,
  ImageAsset,
  MakingChargeType,
  MetalType,
  PriceBreakdown,
  PurityCode,
  SizingType,
} from "@/contracts/common";

/* ------------------------------------------------------------------ */
/* Helper functions                                                   */
/* ------------------------------------------------------------------ */

function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: readonly T[] | T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function subDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  return d;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const SEED_ACTOR = "System Administrator (Seed)";

/* ------------------------------------------------------------------ */
/* Main Advance Seed Function                                         */
/* ------------------------------------------------------------------ */

export async function runAdvanceSeed() {
  logger.info("Starting 100X Advance Level Full Dummy Data Initialization...");

  // 1. Reset local PGlite database
  if (!env.DATABASE_URL) {
    logger.info("Cleaning up old local database directory for clean slate...");
    await rm(resolve(process.cwd(), env.PGLITE_DATA_DIR), { recursive: true, force: true });
  }

  const connection = await createConnection({
    databaseUrl: env.DATABASE_URL,
    pgliteDataDir: env.PGLITE_DATA_DIR,
  });
  setConnection(connection);

  await connection.migrate();
  logger.info("Database migrated. Running core essentials and baseline demo catalogue...");
  await seedDatabase({ demo: true });

  const database = db();
  const now = new Date();

  // Retrieve existing baseline admin users
  const adminList = await database.select().from(adminUsers);
  const superAdmin = adminList.find((a) => a.roleId === "super_admin") || adminList[0]!;
  const salesAdmin = adminList.find((a) => a.roleId === "sales_manager") || superAdmin;
  const invAdmin = adminList.find((a) => a.roleId === "inventory_manager") || superAdmin;

  // Retrieve existing categories, subcategories, collections
  const allCategories = await database.select().from(categories);
  const allSubcategories = await database.select().from(subcategories);
  const allCollections = await database.select().from(collections);

  const catMap = new Map(allCategories.map((c) => [c.slug, c.id]));
  const subMap = new Map(allSubcategories.map((s) => [`${s.categoryId}/${s.slug}`, s.id]));
  const colMap = new Map(allCollections.map((c) => [c.slug, c.id]));

  /* ------------------------------------------------------------------ */
  /* 1. Extended Stock Locations                                         */
  /* ------------------------------------------------------------------ */
  logger.info("Seeding extended stock locations...");
  const extraLocations = [
    { id: "vault", name: "High-Security Vault & Strongroom", displayOrder: 2 },
    { id: "counter_silver", name: "Silver Section Display Counter", displayOrder: 3 },
    { id: "counter_gold", name: "Gold & Diamond Display Counter", displayOrder: 4 },
    { id: "workshop", name: "Surat Artisan Karigar Workshop", displayOrder: 5 },
  ];
  for (const loc of extraLocations) {
    await database.insert(stockLocations).values(loc).onConflictDoNothing();
  }

  /* ------------------------------------------------------------------ */
  /* 2. Master B2B Vendors / Suppliers                                   */
  /* ------------------------------------------------------------------ */
  logger.info("Seeding B2B jewellery vendors...");
  const vendorData = [
    {
      code: "VEN-SURAT-01",
      name: "Gujarat Bullion Refiners & Assayers",
      contactPerson: "Dhirubhai Zaveri",
      mobile: "+91 98251 12345",
      email: "orders@gujaratbullion.com",
      gstin: "24AAACG1234F1Z5",
      address: "201 Bullion Bhavan, Mahidharpura, Surat 395003",
      notes: "Primary supplier of 999 silver grain and 24K LBMA accredited gold bars.",
    },
    {
      code: "VEN-RAJKOT-02",
      name: "Rajkot Silver Castings & Chains",
      contactPerson: "Haresh Patel",
      mobile: "+91 98242 67890",
      email: "info@rajkotsilverchains.com",
      gstin: "24AABCR5678G1Z2",
      address: "Plot 14, GIDC Industrial Estate, Rajkot 360003",
      notes: "Manufacturer of handcrafted silver payals, kadas and Italian machine chains.",
    },
    {
      code: "VEN-JAIPUR-03",
      name: "Jaipur Kundan & Polki Gems Pvt Ltd",
      contactPerson: "Vikram Rathore",
      mobile: "+91 94140 33445",
      email: "vikram@jaipurgems.in",
      gstin: "08AAACJ9012H1Z9",
      address: "74 Johari Bazar, Jaipur 302003",
      notes: "Supplier of natural emeralds, rubies, cultured pearls and Jadau Kundan work.",
    },
    {
      code: "VEN-MUMBAI-04",
      name: "Zaveri Bazaar Gold Works",
      contactPerson: "Mukesh Mehta",
      mobile: "+91 98200 88991",
      email: "sales@zaverigoldworks.com",
      gstin: "27AAACZ3456J1Z1",
      address: "112 Sheikh Memon Street, Zaveri Bazaar, Mumbai 400002",
      notes: "Specializes in 22K die-stamped mangalsutras, temple harams and hollow bangles.",
    },
    {
      code: "VEN-AHMD-05",
      name: "Ahmedabad Antique Silver Findings",
      contactPerson: "Pragnesh Shah",
      mobile: "+91 98980 44556",
      email: "ahmdsilver@gmail.com",
      gstin: "24AAACA7890K1Z4",
      address: "Manek Chowk, Old City, Ahmedabad 380001",
      notes: "Antique finish oxidised findings, clasps, screw backings and locks.",
    },
    {
      code: "VEN-SURAT-06",
      name: "Navsari Diamond & Moissanite Traders",
      contactPerson: "Kamlesh Choksi",
      mobile: "+91 98795 22334",
      email: "navsaridiamonds@gmail.com",
      gstin: "24AAACN2345L1Z7",
      address: "Tower Road, Navsari, Gujarat 396445",
      notes: "VVS-VS lab and natural melee diamonds, CVD solitaires and moissanite.",
    },
    {
      code: "VEN-DELHI-07",
      name: "MMTC-PAMP India Bullion Partner",
      contactPerson: "Rajeev Saxena",
      mobile: "+91 11 4321 0000",
      email: "institutional@mmtcpamp.com",
      gstin: "07AAACM6789M1Z3",
      address: "Connaught Place, New Delhi 110001",
      notes: "Certified 999.9 purity minted coins and bars with tamper-proof certicards.",
    },
    {
      code: "VEN-SURAT-08",
      name: "Surat Luxury Box & Velvet Packaging",
      contactPerson: "Nilesh Vora",
      mobile: "+91 97277 88990",
      email: "packagingsurat@hotmail.com",
      gstin: "24AAACS0123N1Z8",
      address: "Ring Road Textile Market Complex, Surat 395002",
      notes: "Custom engraved wooden boxes, premium suede pouches and LED ring boxes.",
    },
  ];

  const createdVendors = [];
  for (const v of vendorData) {
    const [row] = await database.insert(vendors).values(v).returning();
    createdVendors.push(row!);
  }

  /* ------------------------------------------------------------------ */
  /* 3. Advance Product Catalogue Expansion (100+ New Luxury Items)    */
  /* ------------------------------------------------------------------ */
  logger.info("Seeding 106 advance products across gold, silver, bridal, and utensils...");

  const metalRatesRows = await database.select().from(metalRates);
  const goldRate22 = metalRatesRows.find((r) => r.metal === "gold" && r.purity === "22k")?.ratePerGram || 7450;
  const silverRate925 = metalRatesRows.find((r) => r.metal === "silver" && r.purity === "925")?.ratePerGram || 95;

  interface AdvanceProductSpec {
  type: string;
  sub: string | null;
  metal: MetalType;
  purity: PurityCode;
  gender: Gender;
  name: string;
  netWeight: number;
  making: { type: MakingChargeType; value: number };
  stoneCharges: number;
  stoneDetails: string | null;
  sizing: SizingType | null;
  sizeOptions: string[];
  defaultSize: string | null;
  flags: { featured: boolean; bestSeller: boolean; trending: boolean; newArrival: boolean; limited: boolean };
  collections: string[];
  images: ImageAsset[];
  desc: string;
}

const ADVANCE_PRODUCTS_SPECS: AdvanceProductSpec[] = [
    // RINGS
    {
      type: "rings",
      sub: "solitaire",
      metal: "gold" as MetalType,
      purity: "18k" as PurityCode,
      gender: "women" as Gender,
      name: "The Royal Mirage 18K Solitaire Ring",
      netWeight: 3.8,
      making: { type: "percentage" as MakingChargeType, value: 14 },
      stoneCharges: 42000,
      stoneDetails: "0.75ct EF VVS1 Solitaire Moissanite with micro-pavé halo",
      sizing: "ring" as SizingType,
      sizeOptions: ["10", "12", "14", "16", "18"],
      defaultSize: "14",
      flags: { featured: true, bestSeller: true, trending: true, newArrival: false, limited: false },
      collections: ["bridal-heritage", "everyday-luxe"],
      images: [
        { url: "https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=1200&h=1500&q=80", alt: "18K Solitaire Engagement Ring" },
      ],
      desc: "Graceful 18-karat yellow gold featuring a brilliant hand-set solitaire stone framed by a luminous halo.",
    },
    {
      type: "rings",
      sub: "bands",
      metal: "silver" as MetalType,
      purity: "925" as PurityCode,
      gender: "unisex" as Gender,
      name: "Classic Milano 925 Sterling Comfort Band",
      netWeight: 4.5,
      making: { type: "per_gram" as MakingChargeType, value: 25 },
      stoneCharges: 0,
      stoneDetails: null,
      sizing: "ring" as SizingType,
      sizeOptions: ["12", "14", "16", "18", "20", "22"],
      defaultSize: "16",
      flags: { featured: false, bestSeller: true, trending: false, newArrival: true, limited: false },
      collections: ["sterling-studio", "everyday-luxe"],
      images: [
        { url: "https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=1200&h=1500&q=80", alt: "Sterling Silver Band" },
      ],
      desc: "Silky comfort-fit inner profile in pure 92.5% sterling silver with an electroplated rhodium mirror finish.",
    },
    {
      type: "rings",
      sub: "couple-bands",
      metal: "gold" as MetalType,
      purity: "18k" as PurityCode,
      gender: "unisex" as Gender,
      name: "Eternal Vows Matching Couple Bands Pair",
      netWeight: 8.2,
      making: { type: "percentage" as MakingChargeType, value: 15 },
      stoneCharges: 14000,
      stoneDetails: "Round brilliant diamonds 0.12ct tw",
      sizing: "ring" as SizingType,
      sizeOptions: ["Pair (M18/F12)", "Pair (M20/F14)", "Pair (M22/F16)"],
      defaultSize: "Pair (M20/F14)",
      flags: { featured: true, bestSeller: false, trending: true, newArrival: false, limited: true },
      collections: ["bridal-heritage", "gifting-edit"],
      images: [
        { url: "https://images.unsplash.com/photo-1631982690223-8aa4be0a2497?auto=format&fit=crop&w=1200&h=1500&q=80", alt: "Couple rings pair" },
      ],
      desc: "A harmonious pair of 18K gold bands celebrating mutual commitment, subtly accented with natural diamonds.",
    },
    {
      type: "rings",
      sub: "cocktail",
      metal: "silver" as MetalType,
      purity: "925" as PurityCode,
      gender: "women" as Gender,
      name: "Jaipur Heritage Navratna Floral Cocktail Ring",
      netWeight: 11.2,
      making: { type: "fixed" as MakingChargeType, value: 1200 },
      stoneCharges: 3500,
      stoneDetails: "Nine planetary gemstones set in Kundan bezel",
      sizing: "ring" as SizingType,
      sizeOptions: ["Adjustable Free Size"],
      defaultSize: "Adjustable Free Size",
      flags: { featured: true, bestSeller: false, trending: true, newArrival: true, limited: false },
      collections: ["festive-edit", "sterling-studio"],
      images: [
        { url: "https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=1200&h=1500&q=80", alt: "Cocktail Ring" },
      ],
      desc: "Striking cocktail statement ring celebrating traditional Navratna astrological harmony in oxidised 925 silver.",
    },

    // EARRINGS
    {
      type: "earrings",
      sub: "jhumkas",
      metal: "gold" as MetalType,
      purity: "22k" as PurityCode,
      gender: "women" as Gender,
      name: "Surat Royal Heritage Temple Lakshmi Jhumkas",
      netWeight: 18.5,
      making: { type: "percentage" as MakingChargeType, value: 16 },
      stoneCharges: 4500,
      stoneDetails: "Burmese Cabochon Rubies with hanging natural seed pearls",
      sizing: null,
      sizeOptions: [],
      defaultSize: null,
      flags: { featured: true, bestSeller: true, trending: true, newArrival: false, limited: false },
      collections: ["bridal-heritage", "festive-edit"],
      images: [
        { url: "https://images.unsplash.com/photo-1630019852942-f89202989a59?auto=format&fit=crop&w=1200&h=1500&q=80", alt: "Temple Gold Jhumkas" },
      ],
      desc: "Majestic 22KT hallmarked gold jhumkas engraved with Goddess Lakshmi motifs, suspended with fine pearls.",
    },
    {
      type: "earrings",
      sub: "jhumkas",
      metal: "silver" as MetalType,
      purity: "925" as PurityCode,
      gender: "women" as Gender,
      name: "Antique Oxidised Silver Peacock Chandbali Jhumkas",
      netWeight: 24.0,
      making: { type: "fixed" as MakingChargeType, value: 850 },
      stoneCharges: 600,
      stoneDetails: "Emerald green doublet glass stones with ringing ghungroo bells",
      sizing: null,
      sizeOptions: [],
      defaultSize: null,
      flags: { featured: false, bestSeller: true, trending: true, newArrival: false, limited: false },
      collections: ["sterling-studio", "festive-edit"],
      images: [
        { url: "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=1200&h=1500&q=80", alt: "Oxidised Silver Jhumkas" },
      ],
      desc: "Handcrafted tribal motifs sculpted by skilled artisans with an authentic dark oxidised patina.",
    },
    {
      type: "earrings",
      sub: "studs",
      metal: "gold" as MetalType,
      purity: "18k" as PurityCode,
      gender: "women" as Gender,
      name: "Starlight Solitaire Diamond Daily Studs",
      netWeight: 2.1,
      making: { type: "percentage" as MakingChargeType, value: 12 },
      stoneCharges: 22000,
      stoneDetails: "0.35ct GH SI Certified Diamonds with screw back",
      sizing: null,
      sizeOptions: [],
      defaultSize: null,
      flags: { featured: false, bestSeller: true, trending: false, newArrival: false, limited: false },
      collections: ["everyday-luxe", "gifting-edit"],
      images: [
        { url: "https://images.unsplash.com/photo-1727990865600-91f8cb8b0168?auto=format&fit=crop&w=1200&h=1500&q=80", alt: "Diamond Studs" },
      ],
      desc: "Effortlessly elegant 18K yellow gold studs featuring brilliant solitaire diamonds suitable for everyday wear.",
    },
    {
      type: "earrings",
      sub: "hoops",
      metal: "silver" as MetalType,
      purity: "925" as PurityCode,
      gender: "women" as Gender,
      name: "Chunky Hammered 925 Sterling Silver Huggie Hoops",
      netWeight: 6.8,
      making: { type: "per_gram" as MakingChargeType, value: 30 },
      stoneCharges: 0,
      stoneDetails: null,
      sizing: null,
      sizeOptions: [],
      defaultSize: null,
      flags: { featured: false, bestSeller: false, trending: true, newArrival: true, limited: false },
      collections: ["sterling-studio", "everyday-luxe"],
      images: [
        { url: "https://images.unsplash.com/photo-1630019852942-f89202989a59?auto=format&fit=crop&w=1200&h=1500&q=80", alt: "Silver Hoops" },
      ],
      desc: "Contemporary, hollow-formed sterling silver hoops with artisanal hammered texture and hypoallergenic click-lock.",
    },

    // NECKLACES
    {
      type: "necklaces",
      sub: "bridal-sets",
      metal: "gold" as MetalType,
      purity: "22k" as PurityCode,
      gender: "women" as Gender,
      name: "Imperial Hasli & Rani Haar Bridal Necklace Set",
      netWeight: 68.5,
      making: { type: "percentage" as MakingChargeType, value: 17 },
      stoneCharges: 18500,
      stoneDetails: "Uncut Jadau Polki, Zambian Emerald drops & Basra Pearls",
      sizing: null,
      sizeOptions: [],
      defaultSize: null,
      flags: { featured: true, bestSeller: false, trending: true, newArrival: false, limited: true },
      collections: ["bridal-heritage"],
      images: [
        { url: "https://images.unsplash.com/photo-1705326454924-f6777522b030?auto=format&fit=crop&w=1200&h=1500&q=80", alt: "Bridal Gold Haar" },
      ],
      desc: "An opulent 22KT gold heirloom piece featuring traditional Meenakari work, royal Hasli torque and majestic Rani Haar.",
    },
    {
      type: "necklaces",
      sub: "statement",
      metal: "silver" as MetalType,
      purity: "925" as PurityCode,
      gender: "women" as Gender,
      name: "Kutch Antique Floral Hasli Choker with Rubies",
      netWeight: 54.0,
      making: { type: "fixed" as MakingChargeType, value: 2400 },
      stoneCharges: 1800,
      stoneDetails: "Natural spinels & antique glass insets",
      sizing: null,
      sizeOptions: [],
      defaultSize: null,
      flags: { featured: true, bestSeller: true, trending: true, newArrival: false, limited: false },
      collections: ["sterling-studio", "festive-edit"],
      images: [
        { url: "https://images.unsplash.com/photo-1631050164355-822f8ab7dcb9?auto=format&fit=crop&w=1200&h=1500&q=80", alt: "Silver Hasli Choker" },
      ],
      desc: "Hand-forged rigid silver torque adorned with intricate floral filigree, embodying the rich jewellery crafts of Gujarat.",
    },
    {
      type: "necklaces",
      sub: "everyday",
      metal: "silver" as MetalType,
      purity: "925" as PurityCode,
      gender: "women" as Gender,
      name: "Dainty Venetian Pearl Droplet Silver Chain Necklace",
      netWeight: 5.2,
      making: { type: "per_gram" as MakingChargeType, value: 35 },
      stoneCharges: 850,
      stoneDetails: "AAA Freshwater button pearl",
      sizing: "chain" as SizingType,
      sizeOptions: ["16 inch", "18 inch"],
      defaultSize: "18 inch",
      flags: { featured: false, bestSeller: true, trending: false, newArrival: true, limited: false },
      collections: ["sterling-studio", "everyday-luxe", "gifting-edit"],
      images: [
        { url: "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=1200&h=1500&q=80", alt: "Pearl Drop Necklace" },
      ],
      desc: "Minimalist fine curb chain suspending an ethereal teardrop pearl, finished with 1 micron rhodium flash.",
    },

    // BANGLES & KADAS
    {
      type: "bangles",
      sub: "kada",
      metal: "silver" as MetalType,
      purity: "925" as PurityCode,
      gender: "men" as Gender,
      name: "Sher-Mukhi (Lion Head) Heavy Sterling Silver Kada",
      netWeight: 48.0,
      making: { type: "per_gram" as MakingChargeType, value: 24 },
      stoneCharges: 400,
      stoneDetails: "Ruby red zirconia eyes",
      sizing: "bangle" as SizingType,
      sizeOptions: ["2.6", "2.8", "2.10"],
      defaultSize: "2.8",
      flags: { featured: true, bestSeller: true, trending: true, newArrival: false, limited: false },
      collections: ["mens-signature", "sterling-studio"],
      images: [
        { url: "https://images.unsplash.com/photo-1611652022451-d55126758521?auto=format&fit=crop&w=1200&h=1500&q=80", alt: "Men's Silver Kada" },
      ],
      desc: "Solid sterling silver masculine kada featuring intricately sculpted roaring lion finials, symbolic of royal strength.",
    },
    {
      type: "bangles",
      sub: "pair",
      metal: "gold" as MetalType,
      purity: "22k" as PurityCode,
      gender: "women" as Gender,
      name: "Pachheli Handcrafted Floral Gold Bangles (Pair)",
      netWeight: 36.2,
      making: { type: "percentage" as MakingChargeType, value: 14.5 },
      stoneCharges: 0,
      stoneDetails: null,
      sizing: "bangle" as SizingType,
      sizeOptions: ["2.4", "2.6", "2.8"],
      defaultSize: "2.6",
      flags: { featured: true, bestSeller: true, trending: false, newArrival: false, limited: false },
      collections: ["bridal-heritage", "festive-edit"],
      images: [
        { url: "https://images.unsplash.com/photo-1679156271456-d6068c543ee7?auto=format&fit=crop&w=1200&h=1500&q=80", alt: "Gold Bangles Pair" },
      ],
      desc: "Timeless 22KT gold wedding bangles with relief floral repoussé engraving and secure screw pin clasps.",
    },
    {
      type: "bangles",
      sub: "stackable",
      metal: "silver" as MetalType,
      purity: "925" as PurityCode,
      gender: "women" as Gender,
      name: "Twisted Rope Stackable Silver Bangle Set of 4",
      netWeight: 26.5,
      making: { type: "per_gram" as MakingChargeType, value: 22 },
      stoneCharges: 0,
      stoneDetails: null,
      sizing: "bangle" as SizingType,
      sizeOptions: ["2.4", "2.6", "2.8"],
      defaultSize: "2.6",
      flags: { featured: false, bestSeller: true, trending: true, newArrival: true, limited: false },
      collections: ["sterling-studio", "everyday-luxe"],
      images: [
        { url: "https://images.unsplash.com/photo-1611652022451-d55126758521?auto=format&fit=crop&w=1200&h=1500&q=80", alt: "Silver Stackable Bangles" },
      ],
      desc: "Delicate yet durable four-piece stacking set in sterling silver, alternating between polished and rope braided finishes.",
    },

    // CHAINS & BRACELETS
    {
      type: "chains",
      sub: "rope",
      metal: "gold" as MetalType,
      purity: "22k" as PurityCode,
      gender: "unisex" as Gender,
      name: "Solid Diamond-Cut 22K Gold Rope Chain",
      netWeight: 22.4,
      making: { type: "percentage" as MakingChargeType, value: 11 },
      stoneCharges: 0,
      stoneDetails: null,
      sizing: "chain" as SizingType,
      sizeOptions: ["20 inch", "22 inch", "24 inch"],
      defaultSize: "22 inch",
      flags: { featured: true, bestSeller: true, trending: false, newArrival: false, limited: false },
      collections: ["mens-signature", "everyday-luxe"],
      images: [
        { url: "https://images.unsplash.com/photo-1585711715631-1e6bf224f092?auto=format&fit=crop&w=1200&h=1500&q=80", alt: "Gold Rope Chain" },
      ],
      desc: "Heavyweight 22KT yellow gold chain featuring sharp diamond facets that catch the light from every perspective.",
    },
    {
      type: "bracelets",
      sub: "chain",
      metal: "silver" as MetalType,
      purity: "925" as PurityCode,
      gender: "women" as Gender,
      name: "Nazar Battu (Evil Eye) Turquoise Silver Bracelet",
      netWeight: 6.4,
      making: { type: "fixed" as MakingChargeType, value: 450 },
      stoneCharges: 650,
      stoneDetails: "Hand-enamelled glass evil eye with blue zirconia accents",
      sizing: "bracelet" as SizingType,
      sizeOptions: ["6.5 inch + 1 inch extension"],
      defaultSize: "6.5 inch + 1 inch extension",
      flags: { featured: false, bestSeller: true, trending: true, newArrival: true, limited: false },
      collections: ["sterling-studio", "gifting-edit"],
      images: [
        { url: "https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=1200&h=1500&q=80", alt: "Evil Eye Bracelet" },
      ],
      desc: "Protective and chic, this adjustable 925 sterling silver chain bracelet features a handcrafted Mediterranean talisman.",
    },

    // MANGALSUTRA
    {
      type: "mangalsutra",
      sub: "classic",
      metal: "gold" as MetalType,
      purity: "22k" as PurityCode,
      gender: "women" as Gender,
      name: "Maharashtrian Double Vati 22K Gold Mangalsutra",
      netWeight: 16.8,
      making: { type: "percentage" as MakingChargeType, value: 13 },
      stoneCharges: 1200,
      stoneDetails: "Hand-strung black spinel & auspicious onyx beads",
      sizing: "chain" as SizingType,
      sizeOptions: ["18 inch", "24 inch", "30 inch"],
      defaultSize: "24 inch",
      flags: { featured: true, bestSeller: true, trending: false, newArrival: false, limited: false },
      collections: ["bridal-heritage"],
      images: [
        { url: "https://images.unsplash.com/photo-1719861837593-91dbdd0ed5a0?auto=format&fit=crop&w=1200&h=1500&q=80", alt: "Classic Mangalsutra" },
      ],
      desc: "Traditional sacred marriage chain with dual engraved gold hemispheres (vatis) strung on four-strand black bead cords.",
    },
    {
      type: "mangalsutra",
      sub: "contemporary",
      metal: "gold" as MetalType,
      purity: "18k" as PurityCode,
      gender: "women" as Gender,
      name: "The Modern Eternity Infinity Diamond Mangalsutra",
      netWeight: 4.8,
      making: { type: "percentage" as MakingChargeType, value: 15 },
      stoneCharges: 18000,
      stoneDetails: "0.22ct Round Brilliant Certified Diamonds",
      sizing: "chain" as SizingType,
      sizeOptions: ["16 inch", "18 inch"],
      defaultSize: "16 inch",
      flags: { featured: true, bestSeller: false, trending: true, newArrival: true, limited: false },
      collections: ["everyday-luxe", "bridal-heritage"],
      images: [
        { url: "https://images.unsplash.com/photo-1719861837593-91dbdd0ed5a0?auto=format&fit=crop&w=1200&h=1500&q=80", alt: "Modern Mangalsutra" },
      ],
      desc: "Sleek office-friendly mangalsutra with an infinity motif paved in diamonds, subtly accented with 5 black beads on either side.",
    },

    // PENDANTS
    {
      type: "pendants",
      sub: "medallion",
      metal: "gold" as MetalType,
      purity: "22k" as PurityCode,
      gender: "unisex" as Gender,
      name: "Siddhi Vinayak Auspicious Ganesha Gold Pendant",
      netWeight: 6.2,
      making: { type: "percentage" as MakingChargeType, value: 12 },
      stoneCharges: 800,
      stoneDetails: "Single natural ruby eye",
      sizing: null,
      sizeOptions: [],
      defaultSize: null,
      flags: { featured: true, bestSeller: true, trending: false, newArrival: false, limited: false },
      collections: ["gifting-edit", "festive-edit"],
      images: [
        { url: "https://images.unsplash.com/photo-1569397288884-4d43d6738fbd?auto=format&fit=crop&w=1200&h=1500&q=80", alt: "Ganesha Pendant" },
      ],
      desc: "Detailed 22KT yellow gold devotional medallion capturing the benevolent silhouette of Lord Ganesha.",
    },
    {
      type: "pendants",
      sub: "charm",
      metal: "silver" as MetalType,
      purity: "925" as PurityCode,
      gender: "unisex" as Gender,
      name: "Om & Trishul Spiritual 925 Silver Amulet",
      netWeight: 8.5,
      making: { type: "per_gram" as MakingChargeType, value: 25 },
      stoneCharges: 0,
      stoneDetails: null,
      sizing: null,
      sizeOptions: [],
      defaultSize: null,
      flags: { featured: false, bestSeller: true, trending: true, newArrival: false, limited: false },
      collections: ["mens-signature", "sterling-studio"],
      images: [
        { url: "https://images.unsplash.com/photo-1602752250055-5ebb552fc3ae?auto=format&fit=crop&w=1200&h=1500&q=80", alt: "Shiva Pendant" },
      ],
      desc: "Solid oxidised sterling silver pendant combining Lord Shiva's sacred Trident, Damru and the cosmic Om vibration.",
    },

    // SILVER PUJA ARTICLES & IDOLS (Under silver-jewellery or pendants / custom)
    {
      type: "pendants",
      sub: "medallion",
      metal: "silver" as MetalType,
      purity: "999" as PurityCode,
      gender: "unisex" as Gender,
      name: "Pure 999 Silver Laxmi & Ganesh Idol Pair (100 Grams)",
      netWeight: 100.0,
      making: { type: "per_gram" as MakingChargeType, value: 18 },
      stoneCharges: 0,
      stoneDetails: null,
      sizing: null,
      sizeOptions: [],
      defaultSize: null,
      flags: { featured: true, bestSeller: true, trending: true, newArrival: false, limited: false },
      collections: ["festive-edit", "gifting-edit"],
      images: [
        { url: "https://images.unsplash.com/photo-1602752250055-5ebb552fc3ae?auto=format&fit=crop&w=1200&h=1500&q=80", alt: "Silver Laxmi Ganesh Idols" },
      ],
      desc: "99.9% pure fine silver solid deities crafted for Diwali Puja and housewarming ceremonies with certified hallmarked purity.",
    },
    {
      type: "pendants",
      sub: "medallion",
      metal: "silver" as MetalType,
      purity: "999" as PurityCode,
      gender: "unisex" as Gender,
      name: "Fine 999 Silver Embossed Mangal Kalash with Coconut (150g)",
      netWeight: 150.0,
      making: { type: "per_gram" as MakingChargeType, value: 20 },
      stoneCharges: 0,
      stoneDetails: null,
      sizing: null,
      sizeOptions: [],
      defaultSize: null,
      flags: { featured: true, bestSeller: false, trending: true, newArrival: true, limited: false },
      collections: ["festive-edit"],
      images: [
        { url: "https://images.unsplash.com/photo-1631050164355-822f8ab7dcb9?auto=format&fit=crop&w=1200&h=1500&q=80", alt: "Silver Kalash" },
      ],
      desc: "Handcrafted 999 pure silver Kalash with mango leaves and coconut motif, ideal for Vaastu and Griha Pravesh rituals.",
    },
    {
      type: "pendants",
      sub: "medallion",
      metal: "silver" as MetalType,
      purity: "999" as PurityCode,
      gender: "unisex" as Gender,
      name: "Pure 999 Silver Ram Mandir Commemorative 50g Coin",
      netWeight: 50.0,
      making: { type: "fixed" as MakingChargeType, value: 450 },
      stoneCharges: 0,
      stoneDetails: null,
      sizing: null,
      sizeOptions: [],
      defaultSize: null,
      flags: { featured: true, bestSeller: true, trending: true, newArrival: true, limited: true },
      collections: ["festive-edit", "gifting-edit"],
      images: [
        { url: "https://images.unsplash.com/photo-1602752250055-5ebb552fc3ae?auto=format&fit=crop&w=1200&h=1500&q=80", alt: "Ram Mandir Coin" },
      ],
      desc: "Limited edition 50-gram 999 fine silver minted coin featuring Ayodhya Ram Janmabhoomi Mandir with tamper-evident certificate.",
    },
    {
      type: "pendants",
      sub: "medallion",
      metal: "gold" as MetalType,
      purity: "24k" as PurityCode,
      gender: "unisex" as Gender,
      name: "MMTC-PAMP 24K Pure Gold 10 Gram Lotus Minted Bar",
      netWeight: 10.0,
      making: { type: "fixed" as MakingChargeType, value: 800 },
      stoneCharges: 0,
      stoneDetails: null,
      sizing: null,
      sizeOptions: [],
      defaultSize: null,
      flags: { featured: true, bestSeller: true, trending: false, newArrival: false, limited: false },
      collections: ["festive-edit", "gifting-edit"],
      images: [
        { url: "https://images.unsplash.com/photo-1610375461246-83df859d849d?auto=format&fit=crop&w=1200&h=1500&q=80", alt: "24K Gold Bar" },
      ],
      desc: "999.9 pure 24-karat investment gold bullion bar sealed inside an assay-certified tamper-proof blister card.",
    },
  ];

  // Dynamically generate ~80 variations based on spec templates to reach 106 advance products
  const variations: typeof ADVANCE_PRODUCTS_SPECS = [...ADVANCE_PRODUCTS_SPECS];
  const metals: MetalType[] = ["silver", "gold"];
  const silverPur: PurityCode[] = ["925", "999"];
  const goldPur: PurityCode[] = ["22k", "18k"];

  const prefixes = [
    "Aaradhya", "Maharani", "Parampara", "Surat Antique", "Navratna",
    "Gaurika", "Chandramukhi", "Rajputana", "Viraat", "Devanshi",
    "Samriddhi", "Shree", "Kalyani", "Milan", "Ananya", "Ranakpur",
    "Padmavati", "Suryakant", "Keshari", "Meenakshi"
  ];

  const typesConfig = [
    { type: "rings", sub: "solitaire", m: "gold", p: "18k", name: "Solitaire Crown Ring", wt: [2.5, 5.0], mk: 15, st: 25000 },
    { type: "rings", sub: "bands", m: "silver", p: "925", name: "Artisanal Carved Band", wt: [3.5, 8.0], mk: 25, st: 0 },
    { type: "earrings", sub: "jhumkas", m: "silver", p: "925", name: "Oxidised Chandelier Jhumka", wt: [12.0, 32.0], mk: 600, st: 500 },
    { type: "earrings", sub: "studs", m: "gold", p: "22k", name: "Floral Filigree Gold Tops", wt: [3.2, 7.5], mk: 14, st: 0 },
    { type: "necklaces", sub: "everyday", m: "silver", p: "925", name: "Layered Tennis Paperclip Chain", wt: [8.0, 22.0], mk: 30, st: 1200 },
    { type: "necklaces", sub: "bridal-sets", m: "gold", p: "22k", name: "Kundan Jadau Choker Necklace", wt: [45.0, 95.0], mk: 16.5, st: 15000 },
    { type: "bangles", sub: "kada", m: "silver", p: "925", name: "Nandi Embossed Openable Kada", wt: [35.0, 65.0], mk: 22, st: 0 },
    { type: "bangles", sub: "pair", m: "gold", p: "22k", name: "Gokhru Traditional Gold Bangles", wt: [28.0, 52.0], mk: 13.5, st: 0 },
    { type: "chains", sub: "link", m: "silver", p: "925", name: "Heavy Italian Figaro Chain", wt: [15.0, 45.0], mk: 20, st: 0 },
    { type: "chains", sub: "rope", m: "gold", p: "22k", name: "Classic Hollow Franco Gold Chain", wt: [12.0, 30.0], mk: 12, st: 0 },
    { type: "bracelets", sub: "chain", m: "silver", p: "925", name: "Zircon Tennis Dainty Bracelet", wt: [5.0, 14.0], mk: 450, st: 1500 },
    { type: "pendants", sub: "charm", m: "silver", p: "925", name: "Zodiac Celestial Sun Pendant", wt: [4.5, 9.5], mk: 350, st: 200 },
  ];

  let itemCounter = 1;
  while (variations.length < 106) {
    const pfx = pick(prefixes);
    const cfg = pick(typesConfig);
    const weightVal = round2(cfg.wt[0] + Math.random() * (cfg.wt[1] - cfg.wt[0]));
    const isGold = cfg.m === "gold";

    variations.push({
      type: cfg.type,
      sub: cfg.sub,
      metal: cfg.m as MetalType,
      purity: cfg.p as PurityCode,
      gender: isGold ? "women" as Gender : (Math.random() > 0.5 ? "women" : "men") as Gender,
      name: `${pfx} ${cfg.name} Vol.${itemCounter}`,
      netWeight: weightVal,
      making: isGold
        ? { type: "percentage" as MakingChargeType, value: cfg.mk }
        : { type: "per_gram" as MakingChargeType, value: cfg.mk },
      stoneCharges: cfg.st,
      stoneDetails: cfg.st > 0 ? "Faceted Swiss Zirconia & Gemstones" : null,
      sizing: cfg.type === "rings" ? "ring" as SizingType : (cfg.type === "bangles" ? "bangle" as SizingType : null),
      sizeOptions: cfg.type === "rings" ? ["12", "14", "16", "18"] : (cfg.type === "bangles" ? ["2.4", "2.6", "2.8"] : []),
      defaultSize: cfg.type === "rings" ? "14" : (cfg.type === "bangles" ? "2.6" : null),
      flags: {
        featured: Math.random() < 0.25,
        bestSeller: Math.random() < 0.35,
        trending: Math.random() < 0.4,
        newArrival: Math.random() < 0.5,
        limited: Math.random() < 0.15,
      },
      collections: [isGold ? "bridal-heritage" : "sterling-studio", "everyday-luxe"],
      images: [
        {
          url: isGold
            ? "https://images.unsplash.com/photo-1758995115682-1452a1a9e35b?auto=format&fit=crop&w=1200&h=1500&q=80"
            : "https://images.unsplash.com/photo-1631050164355-822f8ab7dcb9?auto=format&fit=crop&w=1200&h=1500&q=80",
          alt: `${pfx} ${cfg.name}`,
        },
      ],
      desc: `Exclusive handcrafted ${isGold ? "22KT hallmarked gold" : "925 sterling silver"} creation meticulously finished by master karigars in Surat, Gujarat.`,
    });
    itemCounter++;
  }

  const allProductRecords = [];
  let skuIndex = 200;

  for (const item of variations) {
    skuIndex++;
    const categoryId = catMap.get(item.type) || catMap.get("rings")!;
    const subcatKey = `${categoryId}/${item.sub}`;
    const subcategoryId = subMap.get(subcatKey) || null;
    const sku = `${item.metal === "gold" ? "ASG" : "ASS"}-${item.type.slice(0, 3).toUpperCase()}-${skuIndex}`;
    const slug = `${item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${sku.toLowerCase()}`;
    const createdDate = subDays(now, randInt(10, 300));

    const [prodRow] = await database
      .insert(products)
      .values({
        slug,
        sku,
        barcode: `890${randInt(100000000, 999999999)}`,
        name: item.name,
        shortDescription: item.desc.slice(0, 100),
        description: item.desc,
        categoryId,
        subcategoryId,
        metal: item.metal,
        purity: item.purity,
        gender: item.gender,
        netWeight: item.netWeight,
        grossWeight: round2(item.netWeight * 1.05),
        stoneWeight: item.stoneCharges > 0 ? 0.8 : null,
        stoneDetails: item.stoneDetails,
        makingType: item.making.type,
        makingValue: item.making.value,
        stoneCharges: item.stoneCharges,
        otherCharges: 0,
        discount: Math.random() < 0.2 ? { type: "percentage", value: 5, label: "Special Offer" } : null,
        sizing: item.sizing,
        sizeOptions: item.sizeOptions,
        defaultSize: item.defaultSize,
        sizeWeights: {},
        unavailableSizes: [],
        customization: ["engraving", "note"] as CustomizationKey[],
        images: item.images,
        flags: item.flags,
        status: "active",
        createdAt: createdDate,
        updatedAt: createdDate,
      })
      .returning();

    allProductRecords.push(prodRow!);

    // Link collections
    const colIds = item.collections.map((s) => colMap.get(s)).filter((id): id is string => Boolean(id));
    if (colIds.length) {
      await database
        .insert(productCollections)
        .values(colIds.map((collectionId) => ({ productId: prodRow!.id, collectionId })))
        .onConflictDoNothing();
    }
  }

  // Also query the existing products so we have all products in memory
  const fullProductsList = await database.select().from(products);
  logger.info(`Total products available: ${fullProductsList.length} (seeding stock, orders and sales across them)`);

  /* ------------------------------------------------------------------ */
  /* 4. Inventory Stock Allocation across All Locations                 */
  /* ------------------------------------------------------------------ */
  logger.info("Stocking inventory across all locations & creating stock ledger movements...");
  const locIds = ["store", "vault", "counter_silver", "counter_gold"];

  for (const prod of fullProductsList) {
    const storeQty = randInt(4, 18);
    const vaultQty = randInt(10, 40);
    const counterQty = randInt(2, 6);

    await database.insert(inventoryLevels).values([
      { productId: prod.id, locationId: "store", quantity: storeQty },
      { productId: prod.id, locationId: "vault", quantity: vaultQty },
      {
        productId: prod.id,
        locationId: prod.metal === "gold" ? "counter_gold" : "counter_silver",
        quantity: counterQty,
      },
    ]).onConflictDoNothing();

    // Insert stock movements for opening ledger
    await database.insert(stockMovements).values([
      {
        productId: prod.id,
        type: "opening",
        quantityDelta: storeQty,
        locationId: "store",
        totalBefore: 0,
        totalAfter: storeQty,
        locationBefore: 0,
        locationAfter: storeQty,
        reason: "Initial physical audit inventory opening balance",
        referenceType: "seed",
        referenceLabel: "FY2025 Opening Stock",
        actorName: SEED_ACTOR,
        createdAt: subDays(now, 200),
      },
      {
        productId: prod.id,
        type: "purchase",
        quantityDelta: vaultQty,
        locationId: "vault",
        totalBefore: storeQty,
        totalAfter: storeQty + vaultQty,
        locationBefore: 0,
        locationAfter: vaultQty,
        reason: "Inward shipment received from certified manufacturer",
        referenceType: "purchase",
        referenceLabel: "Batch Bullion Receipt",
        actorName: SEED_ACTOR,
        createdAt: subDays(now, 150),
      },
    ]);
  }

  /* ------------------------------------------------------------------ */
  /* 5. B2B Purchases (Vendor Procurements)                              */
  /* ------------------------------------------------------------------ */
  logger.info("Seeding B2B vendor purchase bills...");
  const purchaseBills = [];

  for (let i = 1; i <= 15; i++) {
    const ven = pick(createdVendors);
    const purchaseDate = formatDate(subDays(now, randInt(15, 250)));
    const poNumber = `PO-2025-${String(i).padStart(4, "0")}`;
    const sampleProducts = [pick(fullProductsList), pick(fullProductsList), pick(fullProductsList)];

    let subtotal = 0;
    let totalGrossWt = 0;
    let totalNetWt = 0;
    let totalQty = 0;

    const itemsToInsert = [];
    for (let pos = 0; pos < sampleProducts.length; pos++) {
      const p = sampleProducts[pos]!;
      const qty = randInt(5, 20);
      const netWt = round2(Number(p.netWeight) * qty);
      const grossWt = round2(netWt * 1.03);
      const ratePerGram = p.metal === "gold" ? goldRate22 : silverRate925;
      const makingPerItem = p.metal === "gold" ? 650 : 25;
      const lineTotal = round2(netWt * ratePerGram + makingPerItem * qty);

      subtotal += lineTotal;
      totalGrossWt += grossWt;
      totalNetWt += netWt;
      totalQty += qty;

      itemsToInsert.push({
        productId: p.id,
        description: `B2B Procurement: ${p.name}`,
        sku: p.sku,
        metal: p.metal,
        purity: p.purity,
        quantity: qty,
        grossWeight: grossWt,
        netWeight: netWt,
        ratePerGram: ratePerGram,
        makingCharges: makingPerItem * qty,
        otherCharges: 0,
        lineTotal,
        position: pos + 1,
      });
    }

    const taxAmount = round2(subtotal * 0.03); // 3% GST on jewellery
    const total = round2(subtotal + taxAmount);

    const [purchaseRow] = await database
      .insert(purchases)
      .values({
        purchaseNumber: poNumber,
        vendorId: ven.id,
        vendorInvoiceRef: `INV/${ven.code.slice(4)}/${randInt(1000, 9999)}`,
        purchaseDate,
        receivingLocationId: "vault",
        status: "approved",
        totalQuantity: totalQty,
        totalGrossWeight: round2(totalGrossWt),
        totalNetWeight: round2(totalNetWt),
        subtotal: round2(subtotal),
        taxAmount: round2(taxAmount),
        total: round2(total),
        notes: "Verified against hallmarking assay certificate and digital scales.",
        createdByName: superAdmin.name,
        approvedByName: superAdmin.name,
        approvedAt: subDays(now, randInt(5, 14)),
        createdAt: subDays(now, randInt(15, 250)),
      })
      .returning();

    for (const item of itemsToInsert) {
      await database.insert(purchaseItems).values({
        purchaseId: purchaseRow!.id,
        ...item,
      });
    }

    purchaseBills.push(purchaseRow!);
  }

  /* ------------------------------------------------------------------ */
  /* 6. Customer Master & Realistic Profiles                            */
  /* ------------------------------------------------------------------ */
  logger.info("Seeding 42 customer profiles with Gujarat / National addresses...");

  const CUSTOMER_SEEDS = [
    { fn: "Aarav", ln: "Patel", city: "Surat", area: "Ghod Dod Road", pin: "395007", phone: "9825123401", email: "aarav.patel@gmail.com", vip: true },
    { fn: "Priyanshi", ln: "Shah", city: "Surat", area: "Vesu Canal Road", pin: "395007", phone: "9825123402", email: "priyanshi.shah@yahoo.com", vip: true },
    { fn: "Rajesh", ln: "Mehta", city: "Surat", area: "Bhagal Market", pin: "395003", phone: "9825123403", email: "rajesh.mehta@hotmail.com", vip: false },
    { fn: "Dhruv", ln: "Desai", city: "Surat", area: "Adajan Gam", pin: "395009", phone: "9825123404", email: "dhruv.desai@gmail.com", vip: false },
    { fn: "Ananya", ln: "Joshi", city: "Ahmedabad", area: "Bodakdev", pin: "380054", phone: "9898123405", email: "ananya.joshi@outlook.com", vip: true },
    { fn: "Vikramaditya", ln: "Singhania", city: "Mumbai", area: "Malabar Hill", pin: "400006", phone: "9820123406", email: "vikram.singhania@singhania.org", vip: true },
    { fn: "Meera", ln: "Trivedi", city: "Vadodara", area: "Alkapuri", pin: "390007", phone: "9824123407", email: "meera.trivedi@gmail.com", vip: false },
    { fn: "Harshit", ln: "Vora", city: "Rajkot", area: "Yagnik Road", pin: "360001", phone: "9824123408", email: "harshit.vora@rediffmail.com", vip: false },
    { fn: "Pooja", ln: "Zaveri", city: "Surat", area: "Citylight Road", pin: "395007", phone: "9825123409", email: "pooja.zaveri@gmail.com", vip: true },
    { fn: "Sanjay", ln: "Choksi", city: "Surat", area: "Piplod VIP Road", pin: "395007", phone: "9825123410", email: "sanjay.choksi@choksi.co.in", vip: true },
    { fn: "Bhavik", ln: "Parekh", city: "Bhavnagar", area: "Waghawadi Road", pin: "364001", phone: "9879123411", email: "bhavik.parekh@gmail.com", vip: false },
    { fn: "Kavita", ln: "Solanki", city: "Gandhinagar", area: "Sector 8", pin: "382007", phone: "9825123412", email: "kavita.solanki@gujarat.gov.in", vip: false },
    { fn: "Rakesh", ln: "Soni", city: "Surat", area: "Katargam Main Rd", pin: "395004", phone: "9825123413", email: "rakesh.soni@diamondhub.com", vip: false },
    { fn: "Deepali", ln: "Randeria", city: "Surat", area: "Rander Town", pin: "395005", phone: "9825123414", email: "deepali.randeria@gmail.com", vip: false },
    { fn: "Nikhil", ln: "Agarwal", city: "Delhi", area: "Greater Kailash 1", pin: "110048", phone: "9811123415", email: "nikhil.agarwal@gmail.com", vip: true },
    { fn: "Sneha", ln: "Kapadia", city: "Surat", area: "Palanpur Canal Road", pin: "395009", phone: "9825123416", email: "sneha.kapadia@kapadias.com", vip: false },
    { fn: "Chirag", ln: "Modi", city: "Navsari", area: "Lunsikui Road", pin: "396445", phone: "9879123417", email: "chirag.modi@gmail.com", vip: false },
    { fn: "Jahnavi", ln: "Bhatt", city: "Surat", area: "Athwa Lines", pin: "395001", phone: "9825123418", email: "jahnavi.bhatt@gmail.com", vip: true },
    { fn: "Manish", ln: "Kanani", city: "Surat", area: "Varachha Mini Bazar", pin: "395006", phone: "9825123419", email: "manish.kanani@surattextile.in", vip: false },
    { fn: "Tanvi", ln: "Gheewala", city: "Surat", area: "Nanpura Timber Market", pin: "395001", phone: "9825123420", email: "tanvi.gheewala@gmail.com", vip: false },
    { fn: "Kunal", ln: "Singhal", city: "Jaipur", area: "C-Scheme", pin: "302001", phone: "9414123421", email: "kunal.singhal@gmail.com", vip: true },
    { fn: "Shreya", ln: "Nair", city: "Bengaluru", area: "Indiranagar 100ft Road", pin: "560038", phone: "9845123422", email: "shreya.nair@techcorp.io", vip: false },
    { fn: "Aditya", ln: "Kulkarni", city: "Pune", area: "Koregaon Park", pin: "411001", phone: "9822123423", email: "aditya.kulkarni@gmail.com", vip: false },
    { fn: "Ishaan", ln: "Bansal", city: "Chandigarh", area: "Sector 17", pin: "160017", phone: "9814123424", email: "ishaan.bansal@gmail.com", vip: false },
    { fn: "Prerana", ln: "Merchant", city: "Surat", area: "Dumas Resort Road", pin: "395007", phone: "9825123425", email: "prerana.m@merchanthospitality.com", vip: true },
  ];

  const createdCustomers = [];
  let custIndex = 1000;

  for (const c of CUSTOMER_SEEDS) {
    custIndex++;
    const custCode = `AS-CUST-${custIndex}`;
    const createdAtDate = subDays(now, randInt(20, 360));

    const [row] = await database
      .insert(customers)
      .values({
        customerCode: custCode,
        firstName: c.fn,
        lastName: c.ln,
        email: c.email,
        phone: c.phone,
        status: "active",
        marketingOptIn: true,
        source: c.vip ? "admin" : "website",
        createdAt: createdAtDate,
        updatedAt: createdAtDate,
      })
      .returning();

    // Address
    await database.insert(customerAddresses).values({
      customerId: row!.id,
      label: "Home",
      fullName: `${c.fn} ${c.ln}`,
      phone: c.phone,
      line1: `Bunglow ${randInt(12, 140)}, ${c.area}`,
      line2: `Near Landmark Tower`,
      city: c.city,
      state: c.city === "Surat" || c.city === "Ahmedabad" || c.city === "Vadodara" || c.city === "Rajkot" || c.city === "Navsari" || c.city === "Bhavnagar" || c.city === "Gandhinagar" ? "Gujarat" : (c.city === "Mumbai" || c.city === "Pune" ? "Maharashtra" : "Delhi"),
      postalCode: c.pin,
      country: "India",
      isDefaultShipping: true,
      isDefaultBilling: true,
    });

    if (c.vip) {
      await database.insert(customerNotes).values({
        customerId: row!.id,
        body: "High-value bridal jewellery buyer. Prefers personal consultation and WhatsApp updates on new 22K arrivals.",
        authorName: salesAdmin.name,
        createdAt: createdAtDate,
      });
    }

    createdCustomers.push({ ...row!, ...c });
  }

  /* ------------------------------------------------------------------ */
  /* 7. E-Commerce Orders & Status Histories                            */
  /* ------------------------------------------------------------------ */
  logger.info("Seeding 65 customer orders with lines, taxes, coupons, and logistics tracking...");

  const orderStatuses = [
    "delivered", "delivered", "delivered", "delivered", "delivered",
    "shipped", "processing", "confirmed", "new"
  ];
  const carriers = ["BlueDart Express Logistics", "Sequel Secure Precious Cargo", "Delhivery Surface"];

  const createdOrders = [];
  for (let i = 1; i <= 65; i++) {
    const cust = pick(createdCustomers);
    const status = pick(orderStatuses);
    const orderNum = `AS-ORD-2025-${String(i).padStart(4, "0")}`;
    const orderDate = subDays(now, randInt(2, 280));
    const sampleProducts = [pick(fullProductsList), pick(fullProductsList)];
    const applyCoupon = Math.random() < 0.4;
    const coupon = applyCoupon ? pick(["WELCOME5", "SILVER10", "FESTIVE2000"]) : null;

    let subtotal = 0;
    const orderItemsData = [];

    for (const p of sampleProducts) {
      const rate = p.metal === "gold" ? goldRate22 : silverRate925;
      const metalVal = round2(Number(p.netWeight) * rate);
      const makingVal = p.makingType === "percentage" ? round2((metalVal * Number(p.makingValue)) / 100) : round2(Number(p.makingValue));
      const unitPrice = round2(metalVal + makingVal + Number(p.stoneCharges));
      const lineTotal = unitPrice;
      subtotal += lineTotal;

      const priceSnapshot: PriceBreakdown = {
        currency: "INR",
        metalRatePerGram: rate,
        metalValue: metalVal,
        makingCharges: makingVal,
        stoneCharges: Number(p.stoneCharges),
        otherCharges: 0,
        discount: 0,
        originalPrice: unitPrice,
        taxableValue: unitPrice,
        gstRate: 3,
        gst: round2(unitPrice * 0.03),
        finalPrice: round2(unitPrice * 1.03),
      };

      orderItemsData.push({
        productId: p.id,
        slug: p.slug,
        name: p.name,
        sku: p.sku,
        image: p.images[0] || { url: "https://images.unsplash.com/photo-1631050164355-822f8ab7dcb9", alt: p.name },
        metal: p.metal,
        purity: p.purity,
        size: p.defaultSize,
        grossWeight: Number(p.grossWeight || p.netWeight),
        netWeight: Number(p.netWeight),
        quantity: 1,
        unitPrice,
        lineTotal,
        priceSnapshot,
      });
    }

    let couponDiscount = 0;
    if (coupon === "WELCOME5") couponDiscount = round2(subtotal * 0.05);
    else if (coupon === "SILVER10") couponDiscount = round2(subtotal * 0.1);
    else if (coupon === "FESTIVE2000") couponDiscount = Math.min(2000, subtotal);

    const taxableValue = round2(subtotal - couponDiscount);
    const gst = round2(taxableValue * 0.03);
    const shipping = subtotal > 10000 ? 0 : 150;
    const grandTotal = round2(taxableValue + gst + shipping);

    const addrSnapshot: AddressSnapshot = {
      fullName: `${cust.fn} ${cust.ln}`,
      phone: cust.phone || "9825123401",
      line1: `Bunglow ${randInt(10, 80)}, ${cust.area}`,
      city: cust.city,
      state: cust.city === "Surat" || cust.city === "Ahmedabad" ? "Gujarat" : "Maharashtra",
      postalCode: cust.pin,
      country: "India",
    };

    const isPaid = status !== "cancelled" && status !== "new";
    const [orderRow] = await database
      .insert(orders)
      .values({
        orderNumber: orderNum,
        customerId: cust.id,
        customerName: `${cust.fn} ${cust.ln}`,
        customerEmail: cust.email || "customer@example.com",
        customerPhone: cust.phone || "9825123401",
        status: status as any,
        paymentStatus: isPaid ? "paid" : "pending",
        itemCount: orderItemsData.length,
        subtotal: round2(subtotal),
        productSavings: 0,
        couponCode: coupon,
        couponDiscount: round2(couponDiscount),
        gst: round2(gst),
        shipping,
        grandTotal: round2(grandTotal),
        shippingAddress: addrSnapshot,
        billingAddress: addrSnapshot,
        customerNotes: "Please deliver in luxury gift packaging.",
        carrier: status === "delivered" || status === "shipped" ? pick(carriers) : null,
        trackingNumber: status === "delivered" || status === "shipped" ? `SEC-${randInt(10000000, 99999999)}IN` : null,
        paymentProvider: "razorpay",
        providerOrderId: `order_rzp_${randInt(100000, 999999)}`,
        providerPaymentId: isPaid ? `pay_rzp_${randInt(10000000, 99999999)}` : null,
        paymentMethod: "upi",
        paidAt: isPaid ? orderDate : null,
        stockCommitted: true,
        fulfilmentLocationId: "store",
        createdAt: orderDate,
        updatedAt: orderDate,
      })
      .returning();

    createdOrders.push(orderRow!);

    // Insert order items
    for (const item of orderItemsData) {
      await database.insert(orderItems).values({
        orderId: orderRow!.id,
        ...item,
      });
    }

    // Status event
    await database.insert(orderStatusEvents).values([
      {
        orderId: orderRow!.id,
        status: "confirmed",
        note: "Order confirmed automatically via payment verification webhook.",
        actorType: "system",
        actorName: "Payment Gateway",
        createdAt: orderDate,
      },
      ...(status === "delivered"
        ? [
            {
              orderId: orderRow!.id,
              status: "delivered" as any,
              note: "Secured one-time password verified at doorstep by courier.",
              actorType: "system" as any,
              actorName: "Sequel Logistics Courier Partner",
              createdAt: subDays(now, 1),
            },
          ]
        : []),
    ]);

    // Order communications
    await database.insert(orderCommunications).values({
      orderId: orderRow!.id,
      channel: "whatsapp",
      direction: "outbound",
      summary: `Automated WhatsApp alert sent to ${cust.phone} with order tracking link.`,
      authorName: "System",
      createdAt: orderDate,
    });
  }

  /* ------------------------------------------------------------------ */
  /* 8. In-Store POS Sales & Official Tax Invoices                      */
  /* ------------------------------------------------------------------ */
  logger.info("Seeding 85 in-store sales records and GST invoices...");

  for (let i = 1; i <= 85; i++) {
    const cust = pick(createdCustomers);
    const saleDate = subDays(now, randInt(2, 270));
    const saleNum = `SL-2025-${String(i).padStart(4, "0")}`;
    const invoiceNum = `AS-INV-2025-${String(i).padStart(4, "0")}`;
    const sampleProducts = [pick(fullProductsList)];

    let subtotal = 0;
    const saleLines = [];
    const invoiceLines = [];

    for (const p of sampleProducts) {
      const rate = p.metal === "gold" ? goldRate22 : silverRate925;
      const metalVal = round2(Number(p.netWeight) * rate);
      const makingVal = p.makingType === "percentage" ? round2((metalVal * Number(p.makingValue)) / 100) : round2(Number(p.makingValue));
      const unitPrice = round2(metalVal + makingVal + Number(p.stoneCharges));
      const lineTotal = unitPrice;
      const gstAmt = round2(lineTotal * 0.03);
      subtotal += lineTotal;

      const priceSnapshot: PriceBreakdown = {
        currency: "INR",
        metalRatePerGram: rate,
        metalValue: metalVal,
        makingCharges: makingVal,
        stoneCharges: Number(p.stoneCharges),
        otherCharges: 0,
        discount: 0,
        originalPrice: unitPrice,
        taxableValue: unitPrice,
        gstRate: 3,
        gst: gstAmt,
        finalPrice: round2(unitPrice + gstAmt),
      };

      saleLines.push({
        productId: p.id,
        name: p.name,
        sku: p.sku,
        size: p.defaultSize,
        metal: p.metal,
        purity: p.purity,
        quantity: 1,
        grossWeight: Number(p.grossWeight || p.netWeight),
        netWeight: Number(p.netWeight),
        unitPrice,
        discount: 0,
        gstRate: 3,
        gstAmount: gstAmt,
        lineTotal: round2(unitPrice + gstAmt),
        priceSnapshot,
      });

      invoiceLines.push({
        productId: p.id,
        description: `Gold & Silver Article: ${p.name} (HSN: 7113)`,
        sku: p.sku,
        size: p.defaultSize,
        metal: p.metal,
        purity: p.purity,
        quantity: 1,
        grossWeight: Number(p.grossWeight || p.netWeight),
        netWeight: Number(p.netWeight),
        unitPrice,
        discount: 0,
        taxableValue: unitPrice,
        gstRate: 3,
        gstAmount: gstAmt,
        lineTotal: round2(unitPrice + gstAmt),
        position: 1,
      });
    }

    const gst = round2(subtotal * 0.03);
    const grandTotal = round2(subtotal + gst);

    // Create Sale
    const [saleRow] = await database
      .insert(sales)
      .values({
        saleNumber: saleNum,
        channel: i % 3 === 0 ? "online" : "manual",
        customerId: cust.id,
        customerName: `${cust.fn} ${cust.ln}`,
        customerPhone: cust.phone,
        customerEmail: cust.email,
        subtotal: round2(subtotal),
        discount: 0,
        taxableValue: round2(subtotal),
        gst: round2(gst),
        grandTotal: round2(grandTotal),
        paymentStatus: "paid",
        paymentMethod: pick(["upi", "card", "cash"]),
        locationId: "store",
        notes: "Showroom counter sale with Hallmarked HUID card handed over.",
        createdByName: salesAdmin.name,
        createdAt: saleDate,
      })
      .returning();

    for (const item of saleLines) {
      await database.insert(saleItems).values({
        saleId: saleRow!.id,
        ...item,
      });
    }

    // Create GST Invoice
    const [invRow] = await database
      .insert(invoices)
      .values({
        invoiceNumber: invoiceNum,
        status: "paid",
        source: i % 3 === 0 ? "online_order" : "manual_sale",
        saleId: saleRow!.id,
        customerId: cust.id,
        customer: {
          name: `${cust.fn} ${cust.ln}`,
          mobile: cust.phone,
          email: cust.email,
          address: `Bunglow ${randInt(10, 50)}, ${cust.area}, ${cust.city}`,
        },
        subtotal: round2(subtotal),
        discount: 0,
        taxableValue: round2(subtotal),
        gst: round2(gst),
        grandTotal: round2(grandTotal),
        amountPaid: round2(grandTotal),
        balanceDue: 0,
        issuedAt: saleDate,
        dueDate: formatDate(saleDate),
        notes: "Authorized signatory of Abhishek Silver Jewellers.",
        createdByName: salesAdmin.name,
        createdAt: saleDate,
        updatedAt: saleDate,
      })
      .returning();

    for (const item of invoiceLines) {
      await database.insert(invoiceItems).values({
        invoiceId: invRow!.id,
        ...item,
      });
    }

    // Invoice payment receipt
    await database.insert(invoicePayments).values({
      invoiceId: invRow!.id,
      amount: round2(grandTotal),
      method: "upi",
      reference: `UPI/HDFC/${randInt(1000000000, 9999999999)}`,
      receivedAt: saleDate,
      recordedByName: salesAdmin.name,
      createdAt: saleDate,
    });
  }

  /* ------------------------------------------------------------------ */
  /* 9. Expense Categories & Real Business Ledger Expenses              */
  /* ------------------------------------------------------------------ */
  logger.info("Seeding comprehensive business expense accounts and transactions...");

  const expCatList = [
    { name: "Showroom Rent & Property Maintenance", desc: "Commercial lease for Bhagal Main Road premises" },
    { name: "Karigar Artisan Wages & Casting Charges", desc: "Labor payments for jewellery forging and polishing" },
    { name: "BIS Hallmarking & Lab Assay Fees", desc: "Government approved assay certification and laser HUID stamping" },
    { name: "Staff Payroll & Festive Bonus", desc: "Sales executives, cashier, accounts manager and security" },
    { name: "Electricity & AC Maintenance", desc: "Torrent Power commercial showroom utilities" },
    { name: "Vault & Showroom Insurance", desc: "Theft, burglary, fire and transit block insurance policy" },
    { name: "Packaging, Velvet Boxes & Pouches", desc: "Branded presentation boxes, carrier bags and tamper bags" },
    { name: "Digital Marketing & Social Ads", desc: "Meta, Google and influencer promotional campaigns" },
    { name: "POS & Cloud Tech Infrastructure", desc: "Billing software, internet leased line and barcode supplies" },
    { name: "Store Hospitality & Client Refreshments", desc: "Tea, dry fruits and beverages for walk-in bridal clients" },
  ];

  const createdExpCats = [];
  for (const c of expCatList) {
    const [row] = await database
      .insert(expenseCategories)
      .values({ name: c.name, description: c.desc, active: true })
      .returning();
    createdExpCats.push(row!);
  }

  // Recurring expense profiles
  await database.insert(recurringExpenses).values([
    {
      title: "Monthly Showroom Lease (Silver Arcade)",
      categoryId: createdExpCats[0]!.id,
      amount: 85000,
      frequency: "monthly",
      nextDueDate: "2026-12-05",
      payee: "Silver Arcade Commercial Association, Surat",
      paymentMethod: "bank_transfer",
      paymentSource: "HDFC Current A/C xxxx4921",
      active: true,
      notes: "Showroom Ground Floor 103/104 Rent.",
    },
    {
      title: "Commercial Armed Guard Security Agency",
      categoryId: createdExpCats[5]!.id,
      amount: 28000,
      frequency: "monthly",
      nextDueDate: "2026-12-01",
      payee: "Surat Guardforce Security Services Pvt Ltd",
      paymentMethod: "bank_transfer",
      paymentSource: "HDFC Current A/C xxxx4921",
      active: true,
      notes: "2 Security personnel for daytime showroom security.",
    },
    {
      title: "Cloud Infrastructure & High-Speed Optical Leased Line",
      categoryId: createdExpCats[8]!.id,
      amount: 6500,
      frequency: "monthly",
      nextDueDate: "2026-12-10",
      payee: "Jio Fiber Commercial Business",
      paymentMethod: "upi",
      paymentSource: "UPI QR",
      active: true,
      notes: "Static IP lease line for CCTV monitoring and POS server.",
    },
  ]);

  // Historical ledger entries across 12 months
  const EXPENSES_LOGS = [
    { cat: 0, payee: "Silver Arcade Property Trust", amt: 85000, desc: "Showroom rent for Bhagal premises" },
    { cat: 1, payee: "Surat Karigar Sangathan", amt: 145000, desc: "Artisan wages for festive diwali jewellery crafting" },
    { cat: 2, payee: "Surat Hallmarking Centre (BIS)", amt: 12450, desc: "Hallmarking fee for 480 silver articles with HUID" },
    { cat: 3, payee: "Staff Payroll Register", amt: 215000, desc: "Monthly salary disbursement for showroom sales team" },
    { cat: 4, payee: "Torrent Power Ltd", amt: 28400, desc: "Commercial electricity bill for showroom air conditioning" },
    { cat: 5, payee: "New India Assurance Co", amt: 54000, desc: "Annual jeweler's block insurance premium" },
    { cat: 6, payee: "Surat Luxury Box Manufacturers", amt: 38500, desc: "300 Velvet jewelry boxes with gold foil logo" },
    { cat: 7, payee: "Meta Platforms Ireland Ltd", amt: 45000, desc: "Instagram ads for Akshaya Tritiya wedding collection" },
    { cat: 8, payee: "Tally & Cloud Systems Ltd", amt: 18000, desc: "Annual ERP renewal and barcode ribbon rolls" },
    { cat: 9, payee: "Surat Dry Fruits & Tea Co", amt: 11200, desc: "Hospitality beverages and dry fruit gift platters" },
  ];

  for (let m = 1; m <= 40; m++) {
    const template = pick(EXPENSES_LOGS);
    const expDate = formatDate(subDays(now, randInt(5, 330)));
    const expNum = `EXP-2025-${String(m).padStart(4, "0")}`;
    const amount = round2(template.amt * (0.9 + Math.random() * 0.2));

    await database.insert(expenses).values({
      expenseNumber: expNum,
      expenseDate: expDate,
      categoryId: createdExpCats[template.cat]!.id,
      amount,
      totalAmount: amount,
      paymentMethod: pick(["bank_transfer", "upi", "cheque"]),
      paymentSource: "HDFC Current A/C",
      payee: template.payee,
      referenceNumber: `TXN-${randInt(100000, 999999)}`,
      description: template.desc,
      status: "paid",
      paidAt: subDays(now, randInt(5, 330)),
      paidByName: superAdmin.name,
      createdByName: superAdmin.name,
      createdAt: subDays(now, randInt(5, 330)),
    });
  }

  /* ------------------------------------------------------------------ */
  /* 10. CRM Customer Enquiries & Contact Logs                          */
  /* ------------------------------------------------------------------ */
  logger.info("Seeding 25 customer CRM leads, custom bridal requests, and call logs...");

  const ENQUIRY_SEEDS = [
    {
      name: "Mrs. Meena Kapadia",
      mob: "+91 98251 88990",
      email: "meena.k@gmail.com",
      type: "custom_jewellery" as const,
      sub: "Bespoke Bridal Choker",
      msg: "Looking to replicate a family heirloom 22K gold temple choker necklace with genuine Zambian emeralds for my daughter's wedding in February.",
      budget: "₹3,50,000 – ₹5,00,000",
      metal: "22K Yellow Gold",
    },
    {
      name: "Prakash Zaveri",
      mob: "+91 98240 11223",
      email: "prakash@zaveritraders.com",
      type: "contact" as const,
      sub: "Bulk 999 Silver Coins for Corporate Diwali Gifting",
      msg: "Need quote for 150 pieces of 50-gram 999 fine silver coins with custom company logo embossing on the reverse side.",
      budget: "₹6,00,000 – ₹8,00,000",
      metal: "999 Fine Silver",
    },
    {
      name: "Roshni Patel",
      mob: "+91 97270 44556",
      email: "roshni.patel@yahoo.com",
      type: "product" as const,
      sub: "Kada Sizing & Custom Engraving",
      msg: "Is it possible to order the Sher-Mukhi Men's Silver Kada in size 2.10 with Gujarati monogram engraving on the inner rim?",
      budget: "₹8,000 – ₹12,000",
      metal: "925 Sterling Silver",
    },
    {
      name: "Dhiren Choksi",
      mob: "+91 99090 33445",
      email: "dhiren.choksi@hotmail.com",
      type: "custom_jewellery" as const,
      sub: "Old Gold Exchange & Melting Consultation",
      msg: "I have 45 grams of 22K old gold jewelry which I would like to melt and convert into a pair of modern handcrafted Pachheli bangles.",
      budget: "Exchange + Making Charges",
      metal: "22K Gold",
    },
    {
      name: "Snehal Desai",
      mob: "+91 98980 77889",
      email: "snehal.desai@gmail.com",
      type: "product" as const,
      sub: "Silver Dinner Set for Griha Pravesh Gift",
      msg: "Interested in the 450-gram Pure Silver Thali Set. Can it be delivered to Adajan with luxury velvet presentation packing by Friday?",
      budget: "₹45,000 – ₹55,000",
      metal: "999 Fine Silver",
    },
  ];

  for (let e = 1; e <= 25; e++) {
    const template = pick(ENQUIRY_SEEDS);
    const enqDate = subDays(now, randInt(2, 180));
    const refNum = `ENQ-2025-${String(e).padStart(4, "0")}`;

    const [enqRow] = await database
      .insert(enquiries)
      .values({
        reference: refNum,
        type: template.type,
        source: pick(["website_form", "whatsapp", "walk_in", "product_page"]),
        name: template.name,
        mobile: template.mob,
        email: template.email,
        subject: template.sub,
        message: template.msg,
        budgetRange: template.budget,
        preferredMetal: template.metal,
        preferredContact: "whatsapp",
        status: pick(["new", "in_progress", "responded", "closed"]),
        assignedToAdminId: salesAdmin.id,
        createdAt: enqDate,
        updatedAt: enqDate,
      })
      .returning();

    // Notes
    await database.insert(enquiryNotes).values({
      enquiryId: enqRow!.id,
      body: `Customer spoke with ${salesAdmin.name}. Shared preliminary CAD renderings and current metal rate estimates.`,
      authorName: salesAdmin.name,
      createdAt: enqDate,
    });

    // Contact log
    await database.insert(enquiryContactLogs).values({
      enquiryId: enqRow!.id,
      channel: "phone",
      outcome: "Interested in showroom visit this weekend to inspect physical samples.",
      note: "Discussed purity certification, hallmarking guarantees and making charges.",
      authorName: salesAdmin.name,
      createdAt: enqDate,
    });
  }

  /* ------------------------------------------------------------------ */
  /* 11. Rich Blog Articles, Testimonials, FAQs, Offers & Coupons      */
  /* ------------------------------------------------------------------ */
  logger.info("Seeding editorial blog posts, verified customer reviews, and promotional offers...");

  // Blog posts
  const BLOGS = [
    {
      slug: "understanding-bis-hallmarking-huid-code-guide-2026",
      title: "Understanding BIS Hallmarking: What the 6-Digit HUID Code Means For You",
      excerpt: "Why the Bureau of Indian Standards HUID is the single most important trust seal when purchasing gold and silver jewellery in India.",
      category: "Education & Buying Guides",
      readingMinutes: 5,
      author: { name: "Abhishek Zaveri", role: "Master Jeweller & Founder" },
      tags: ["Hallmarking", "Gold Purity", "BIS HUID", "Consumer Protection"],
      content: [
        { type: "paragraph" as const, text: "Hallmarking in India has transitioned into a strictly traceable digital ecosystem. Every certified piece of jewellery now bears a unique 6-character alphanumeric code known as the HUID (Hallmark Unique Identification)." },
        { type: "heading" as const, level: 2 as const, text: "The Three Sacred Hallmarking Symbols" },
        { type: "paragraph" as const, text: "When examining authentic jewellery under magnification, look for: 1) The triangular BIS logo, 2) The purity mark (e.g., 22K916 for 22 karat gold or 925 for sterling silver), and 3) The unique 6-digit laser-etched HUID code." },
      ],
      coverImage: {
        url: "https://images.unsplash.com/photo-1705326454924-f6777522b030?auto=format&fit=crop&w=1200&h=1500&q=80",
        alt: "Gold jewellery hallmarking inspection",
      },
    },
    {
      slug: "how-to-care-clean-925-sterling-silver-jewellery",
      title: "The Ultimate Guide: How to Clean & Maintain 925 Sterling Silver at Home",
      excerpt: "Expert secrets to prevent silver oxidation and keep your silverware and jewellery dazzling for decades.",
      category: "Jewellery Care",
      readingMinutes: 4,
      author: { name: "Pooja Vora", role: "Senior Gemologist" },
      tags: ["Silver Care", "Maintenance", "Sterling Silver", "DIY Cleaning"],
      content: [
        { type: "paragraph" as const, text: "Silver naturally reacts with trace sulphur in the air, creating a harmless surface patina called tarnish. With proper storage in anti-tarnish velvet pouches and periodic soft polishing, your silver will retain its mirror luster." },
      ],
      coverImage: {
        url: "https://images.unsplash.com/photo-1631050164355-822f8ab7dcb9?auto=format&fit=crop&w=1200&h=1500&q=80",
        alt: "Polishing silver jewellery",
      },
    },
    {
      slug: "gujarat-bridal-jewellery-traditions-trousseau-guide",
      title: "Gujarat's Royal Bridal Traditions: Essential Pieces for the Trousseau",
      excerpt: "From the sacred Hasli choker to intricate Pachheli kadas: exploring Gujarati heritage bridal craftsmanship.",
      category: "Bridal & Heritage",
      readingMinutes: 6,
      author: { name: "Abhishek Zaveri", role: "Master Jeweller & Founder" },
      tags: ["Bridal Trousseau", "Gujarati Weddings", "Pachheli Bangles", "Temple Gold"],
      content: [
        { type: "paragraph" as const, text: "A traditional Gujarati bridal trousseau is a celebration of architectural motifs, auspicious symbols and heirloom gold craftsmanship that passes across generations." },
      ],
      coverImage: {
        url: "https://images.unsplash.com/photo-1610173826014-d131b02d69ca?auto=format&fit=crop&w=2400&h=1500&q=80",
        alt: "Gujarati Bride in Wedding Jewellery",
      },
    },
  ];

  for (const b of BLOGS) {
    await database.insert(blogPosts).values({
      slug: b.slug,
      title: b.title,
      excerpt: b.excerpt,
      category: b.category,
      coverImage: b.coverImage,
      author: b.author,
      content: b.content,
      tags: b.tags,
      readingMinutes: b.readingMinutes,
      status: "published",
      publishedAt: subDays(now, 45),
      createdAt: subDays(now, 45),
    }).onConflictDoNothing();
  }

  // Customer testimonials
  const TESTIMONIALS = [
    {
      name: "Dr. Kirit & Hansa Patel",
      location: "Ghod Dod Road, Surat",
      quote: "We ordered our daughter's complete bridal trousseau from Abhishek Silver. The transparency in metal weight, exact making charges and BIS HUID certification gave us 100% peace of mind. Truly the finest jewellers in Surat.",
      rating: 5,
      productName: "Imperial Hasli & Rani Haar Bridal Set",
    },
    {
      name: "Anandita Sengupta",
      location: "Bandra West, Mumbai",
      quote: "The 925 sterling silver kada and choker arrived in Mumbai within 48 hours via Sequel Secure cargo. The finish, weight and intricate lion-face carving exceeded all my expectations!",
      rating: 5,
      productName: "Sher-Mukhi Heavy Sterling Silver Kada",
    },
    {
      name: "Bhavesh & Nita Shah",
      location: "Vesu, Surat",
      quote: "For our family's new bungalow Griha Pravesh, we purchased the 999 Silver Kalash and Laxmi Ganesh idols. The craftsmanship is divine and purity certified.",
      rating: 5,
      productName: "Pure 999 Silver Laxmi & Ganesh Idol Pair",
    },
    {
      name: "Sneha Ramachandran",
      location: "Indiranagar, Bengaluru",
      quote: "I was looking for an everyday modern mangalsutra that doesn't feel heavy at work. The eternity diamond mangalsutra is subtle, comfortable and brilliantly sparkly.",
      rating: 5,
      productName: "Modern Eternity Infinity Diamond Mangalsutra",
    },
  ];

  for (let idx = 0; idx < TESTIMONIALS.length; idx++) {
    const t = TESTIMONIALS[idx]!;
    await database.insert(testimonials).values({
      name: t.name,
      location: t.location,
      quote: t.quote,
      rating: t.rating,
      productName: t.productName,
      isSample: false,
      displayOrder: idx + 1,
      active: true,
      createdAt: subDays(now, randInt(10, 100)),
    });
  }

  // Extra coupons
  const EXTRA_COUPONS = [
    {
      code: "AKSHAYAGOLD",
      description: "Flat 25% discount on Gold Jewellery Making Charges for Akshaya Tritiya booking.",
      type: "percentage" as const,
      value: 25,
      minOrderValue: 25000,
      maxDiscount: 7500,
    },
    {
      code: "BRIDAL5000",
      description: "Special ₹5,000 flat savings on complete bridal necklace sets above ₹1,00,000.",
      type: "fixed" as const,
      value: 5000,
      minOrderValue: 100000,
    },
    {
      code: "DIWALI999",
      description: "Flat 10% discount on all 999 Fine Silver Coins and Puja Deities.",
      type: "percentage" as const,
      value: 10,
      minOrderValue: 5000,
      maxDiscount: 2000,
    },
  ];

  for (const coup of EXTRA_COUPONS) {
    await database.insert(coupons).values({
      code: coup.code,
      description: coup.description,
      type: coup.type,
      value: coup.value,
      minOrderValue: coup.minOrderValue,
      maxDiscount: coup.maxDiscount,
      active: true,
    }).onConflictDoNothing();
  }

  logger.info("100X Advance Level Full Dummy Data Initialization Completed Successfully!");
  logger.info({
    totalProducts: fullProductsList.length,
    locations: 5,
    vendors: createdVendors.length,
    purchases: purchaseBills.length,
    customers: createdCustomers.length,
    orders: createdOrders.length,
    sales: 85,
    invoices: 85,
    expenses: 40,
    enquiries: 25,
    blogs: BLOGS.length,
    testimonials: TESTIMONIALS.length,
  });
}

try {
  await runAdvanceSeed();
  process.exit(0);
} catch (err) {
  logger.error({ err }, "Advance seed failed");
  process.exit(1);
}
