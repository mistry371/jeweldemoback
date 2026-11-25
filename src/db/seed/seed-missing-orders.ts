import { eq, sql } from "drizzle-orm";
import { env } from "@/config/env";
import { createConnection, db, setConnection } from "../client";
import {
  customers,
  orderItems,
  orderNotes,
  orderReturns,
  orders,
  orderStatusEvents,
  products,
  refunds,
  stockLocations,
  type OrderStatus,
} from "../schema";
import { logger } from "../../lib/logger";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function subDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  return d;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function main() {
  const connection = await createConnection({ databaseUrl: env.DATABASE_URL, pgliteDataDir: env.PGLITE_DATA_DIR });
  setConnection(connection);
  try {
  const database = db();
  logger.info("Seeding dummy data for missing Order statuses, Returns, and Refunds...");

  const allCustomers = await database.select().from(customers).limit(30);
  const allProducts = await database.select().from(products).where(eq(products.status, "active")).limit(50);
  const locations = await database.select().from(stockLocations).limit(5);

  if (!allCustomers.length || !allProducts.length || !locations.length) {
    throw new Error("Base seed data (customers, products, locations) is missing. Run base seed first.");
  }

  const defaultLocation = locations[0]!;
  const now = new Date();

  // Helper to create an order with full line items, events, and notes
  async function createOrderWithItems(opts: {
    orderNumber: string;
    status: OrderStatus;
    paymentStatus: "pending" | "paid" | "refunded";
    daysAgo: number;
    note?: string;
    carrier?: string;
    trackingNumber?: string;
  }) {
    const cust = pick(allCustomers);
    const prod = pick(allProducts);
    const qty = Math.random() > 0.7 ? 2 : 1;
    const unitPrice = Number(prod.priceOverride || prod.makingCharge || 4500) + 2500;
    const subtotal = round2(unitPrice * qty);
    const gst = round2(subtotal * 0.03);
    const grandTotal = round2(subtotal + gst);
    const createdAt = subDays(now, opts.daysAgo);

    const address = {
      fullName: `${cust.firstName} ${cust.lastName}`,
      phone: cust.phone || "9825123401",
      line1: "402, Heritage Silver Plaza, CG Road",
      line2: "Navrangpura",
      city: "Ahmedabad",
      state: "Gujarat",
      postalCode: "380009",
      country: "India",
    };

    const [order] = await database
      .insert(orders)
      .values({
        orderNumber: opts.orderNumber,
        customerId: cust.id,
        customerName: `${cust.firstName} ${cust.lastName}`,
        customerEmail: cust.email || "customer@example.com",
        customerPhone: cust.phone || "9825123401",
        status: opts.status,
        paymentStatus: opts.paymentStatus,
        itemCount: qty,
        subtotal,
        productSavings: 0,
        couponDiscount: 0,
        gst,
        shipping: 0,
        grandTotal,
        shippingAddress: address,
        billingAddress: address,
        carrier: opts.carrier ?? null,
        trackingNumber: opts.trackingNumber ?? null,
        paymentProvider: "razorpay",
        providerOrderId: `order_rzp_${opts.orderNumber.replace(/[^A-Z0-9]/gi, "")}`,
        providerPaymentId: opts.paymentStatus === "pending" ? null : `pay_rzp_${Math.floor(100000 + Math.random() * 900000)}`,
        paymentMethod: opts.paymentStatus === "pending" ? null : pick(["UPI", "Card", "Net banking"]),
        paidAt: opts.paymentStatus === "pending" ? null : createdAt,
        stockCommitted: opts.status !== "cancelled" && opts.status !== "new",
        fulfilmentLocationId: defaultLocation.id,
        createdAt,
        updatedAt: createdAt,
      })
      .returning();

    const [item] = await database
      .insert(orderItems)
      .values({
        orderId: order!.id,
        productId: prod.id,
        slug: prod.slug,
        name: prod.name,
        sku: prod.sku,
        image: { url: "/images/placeholder.jpg", alt: prod.name },
        metal: prod.metal,
        purity: prod.purity,
        size: "Standard",
        grossWeight: prod.grossWeight ?? prod.netWeight ?? 10,
        netWeight: prod.netWeight ?? prod.grossWeight ?? 10,
        quantity: qty,
        unitPrice,
        lineTotal: subtotal,
        priceSnapshot: {
          metalValue: round2(subtotal * 0.72),
          makingCharge: round2(subtotal * 0.2),
          stoneValue: 0,
          discount: 0,
          gst,
          total: grandTotal,
        } as any,
      })
      .returning();

    // Insert status timeline events
    await database.insert(orderStatusEvents).values({
      orderId: order!.id,
      status: "new",
      note: "Order placed via Storefront checkout.",
      actorType: "customer",
      actorName: `${cust.firstName} ${cust.lastName}`,
      createdAt,
    });

    if (opts.status !== "new") {
      await database.insert(orderStatusEvents).values({
        orderId: order!.id,
        status: opts.status,
        note: opts.note || `Order transitioned to ${opts.status}.`,
        actorType: "admin",
        actorName: "Sales Manager",
        createdAt: subDays(now, Math.max(0, opts.daysAgo - 1)),
      });
    }

    if (opts.note) {
      await database.insert(orderNotes).values({
        orderId: order!.id,
        body: opts.note,
        authorName: "Sales Manager",
        createdAt,
      });
    }

    return { order: order!, item: item! };
  }

  // Check if we already seeded the full ORD-2026-* set (28 orders)
  const existing = await database.execute(sql`SELECT count(*)::int as cnt FROM orders WHERE order_number LIKE 'ORD-2026-%'`);
  const existingRows = Array.isArray(existing) ? existing : (existing as { rows: { cnt?: number }[] }).rows;
  const existingCount = Number(existingRows[0]?.cnt ?? 0);
  if (existingCount > 0 && existingCount < 28) {
    await database.execute(sql`DELETE FROM orders WHERE order_number LIKE 'ORD-2026-%'`);
  }
  if (existingCount < 28) {
    let seq = 9001;

    // 1. NEW orders (4)
    for (let i = 0; i < 4; i++) {
      await createOrderWithItems({
        orderNumber: `ORD-2026-${seq++}`,
        status: "new",
        paymentStatus: "paid",
        daysAgo: i,
        note: "Awaiting sales team verification and BIS hallmarking check.",
      });
    }

    // 2. PACKED orders (5)
    for (let i = 0; i < 5; i++) {
      await createOrderWithItems({
        orderNumber: `ORD-2026-${seq++}`,
        status: "packed",
        paymentStatus: "paid",
        daysAgo: i + 1,
        carrier: "Sequel Logistics",
        trackingNumber: `SEQ-${Math.floor(10000000 + Math.random() * 89999999)}IN`,
        note: "Tamper-proof velvet box sealed with 925 hallmark certificate. Ready for courier pickup.",
      });
    }

    // 3. COMPLETED orders (8)
    for (let i = 0; i < 8; i++) {
      await createOrderWithItems({
        orderNumber: `ORD-2026-${seq++}`,
        status: "completed",
        paymentStatus: "paid",
        daysAgo: i + 10,
        carrier: "BlueDart Insured",
        trackingNumber: `BD-${Math.floor(10000000 + Math.random() * 89999999)}IN`,
        note: "Delivered and signed with OTP verification. Return window closed.",
      });
    }

    // 4. CANCELLED orders (3)
    const cancelReasons = [
      "Customer requested cancellation before dispatch — wants to upgrade to heavier bridal set.",
      "Duplicate order placed by mistake during checkout.",
      "Delivery pincode temporarily unserviceable for insured high-value transit.",
    ];
    for (let i = 0; i < 3; i++) {
      await createOrderWithItems({
        orderNumber: `ORD-2026-${seq++}`,
        status: "cancelled",
        paymentStatus: "paid",
        daysAgo: i + 3,
        note: cancelReasons[i],
      });
    }

    // 5. RETURNED orders (4) + order_returns records
    const returnReasons = [
      "Ring size 14 too tight — customer requested exchange for size 16.",
      "Gift recipient preferred antique oxidized finish instead of bright silver polish.",
      "Bangle clasp felt slightly loose on inspection; returned for workshop adjustment.",
      "Customer wanted higher weight 100g silver bar instead of 50g.",
    ];
    const returnStatuses = ["requested", "approved", "received", "closed"] as const;

    for (let i = 0; i < 4; i++) {
      const { order, item } = await createOrderWithItems({
        orderNumber: `ORD-2026-${seq++}`,
        status: "returned",
        paymentStatus: "paid",
        daysAgo: i + 6,
        carrier: "Sequel Reverse Pickup",
        trackingNumber: `RET-${Math.floor(10000000 + Math.random() * 89999999)}IN`,
        note: returnReasons[i],
      });

      await database.insert(orderReturns).values({
        returnNumber: `RET-2026-0${i + 1}`,
        orderId: order.id,
        status: returnStatuses[i]!,
        reason: returnReasons[i]!,
        items: [
          {
            orderItemId: item.id,
            productId: item.productId,
            name: item.name,
            sku: item.sku,
            quantity: item.quantity,
          },
        ],
        restocked: i >= 2,
        restockLocationId: i >= 2 ? defaultLocation.id : null,
        notes: i >= 2 ? "Inspected by QA team: hallmark intact, weight verified, restocked to main vault." : "Reverse pickup scheduled.",
        createdByName: "Sales Manager",
        createdAt: subDays(now, i + 2),
        updatedAt: subDays(now, i + 1),
      });
    }

    // 6. REFUNDED orders (4) + refunds records (+1 refund on a cancelled order)
    const refundReasons = [
      "Full refund processed for returned 925 silver anklet.",
      "Customer cancelled order prior to dispatch; instant UPI refund settled.",
      "Refund issued for size unavailability on custom silver kada.",
      "Partial adjustment & full order refund completed via Razorpay.",
    ];
    const refundMethods = ["original_payment", "upi", "bank_transfer", "original_payment"] as const;

    for (let i = 0; i < 4; i++) {
      const { order, item } = await createOrderWithItems({
        orderNumber: `ORD-2026-${seq++}`,
        status: "refunded",
        paymentStatus: "refunded",
        daysAgo: i + 8,
        note: refundReasons[i],
      });

      const [ret] = await database
        .insert(orderReturns)
        .values({
          returnNumber: `RET-2026-1${i + 1}`,
          orderId: order.id,
          status: "closed",
          reason: refundReasons[i]!,
          items: [
            {
              orderItemId: item.id,
              productId: item.productId,
              name: item.name,
              sku: item.sku,
              quantity: item.quantity,
            },
          ],
          restocked: true,
          restockLocationId: defaultLocation.id,
          notes: "Returned item verified and closed with full refund.",
          createdByName: "Super Admin",
          createdAt: subDays(now, i + 4),
          updatedAt: subDays(now, i + 2),
        })
        .returning();

      await database.insert(refunds).values({
        refundNumber: `REF-2026-0${i + 1}`,
        orderId: order.id,
        returnId: ret!.id,
        amount: order.grandTotal,
        method: refundMethods[i]!,
        status: i === 3 ? "pending" : "processed",
        reference: i === 3 ? null : `rfnd_RZP_${Math.floor(10000000 + Math.random() * 89999999)}`,
        reason: refundReasons[i]!,
        createdByName: "Super Admin",
        processedAt: i === 3 ? null : subDays(now, i + 1),
        createdAt: subDays(now, i + 2),
        updatedAt: subDays(now, i + 1),
      });
    }

    logger.info("Successfully seeded New, Packed, Completed, Cancelled, Returned, and Refunded orders + Returns & Refunds!");
  } else {
    logger.info("ORD-2026-* dummy orders already exist — skipping duplicate insert.");
  }

  } finally {
    await connection.close();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
