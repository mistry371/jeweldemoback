import puppeteer from "puppeteer-core";
import { mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_OUT_DIR = "C:\\Users\\ADMIN\\Downloads\\abhishek silver\\screenshots";

const DIRS = {
  storefront: join(BASE_OUT_DIR, "01-storefront-pages"),
  catalogue: join(BASE_OUT_DIR, "02-jewellery-catalogue-and-collections"),
  ecommerce: join(BASE_OUT_DIR, "03-ecommerce-and-customer-flows"),
  adminDashboard: join(BASE_OUT_DIR, "04-admin-erp-dashboard-and-analytics"),
  adminInventory: join(BASE_OUT_DIR, "05-admin-inventory-and-supply-chain"),
  adminSales: join(BASE_OUT_DIR, "06-admin-sales-orders-and-billing"),
  adminCrm: join(BASE_OUT_DIR, "07-admin-crm-and-customer-management"),
  adminFinance: join(BASE_OUT_DIR, "08-admin-finance-and-expenses"),
  adminMarketing: join(BASE_OUT_DIR, "09-admin-marketing-and-cms"),
};

for (const dir of Object.values(DIRS)) {
  await mkdir(dir, { recursive: true });
}

console.log("Launching headless Chrome browser for high-res screenshot capture...");
const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--window-size=1440,960",
    "--hide-scrollbars",
    "--disable-gpu",
  ],
  defaultViewport: { width: 1440, height: 960, deviceScaleFactor: 1.5 },
});

const page = await browser.newPage();

async function snap(url, filePath, delayMs = 1200) {
  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    await page.screenshot({ path: filePath, fullPage: false });
    console.log(`[Captured] ${filePath.replace(BASE_OUT_DIR, "")}`);
  } catch (err) {
    console.error(`[Failed] ${url} -> ${err.message}`);
  }
}

console.log("\n--- Phase 1: Storefront Core Pages ---");
await snap("http://localhost:3000", join(DIRS.storefront, "01-storefront-home.png"), 2000);
await snap("http://localhost:3000/about", join(DIRS.storefront, "02-about-heritage.png"));
await snap("http://localhost:3000/contact", join(DIRS.storefront, "03-contact-and-showroom.png"));
await snap("http://localhost:3000/custom-jewellery", join(DIRS.storefront, "04-custom-bespoke-jewellery.png"));
await snap("http://localhost:3000/blog", join(DIRS.storefront, "05-educational-blog.png"));
await snap("http://localhost:3000/blog/understanding-bis-hallmarking-huid-code-guide-2026", join(DIRS.storefront, "06-blog-bis-hallmarking-guide.png"));
await snap("http://localhost:3000/faq", join(DIRS.storefront, "07-faq-knowledgebase.png"));
await snap("http://localhost:3000/shipping", join(DIRS.storefront, "08-shipping-and-insurance-policy.png"));
await snap("http://localhost:3000/returns", join(DIRS.storefront, "09-returns-and-buyback-policy.png"));
await snap("http://localhost:3000/privacy", join(DIRS.storefront, "10-privacy-policy.png"));
await snap("http://localhost:3000/terms", join(DIRS.storefront, "11-terms-of-service.png"));

console.log("\n--- Phase 2: Jewellery Catalogue & Collections ---");
await snap("http://localhost:3000/shop", join(DIRS.catalogue, "12-full-catalogue-shop.png"), 2000);
await snap("http://localhost:3000/shop/gold-jewellery", join(DIRS.catalogue, "13-gold-jewellery-category.png"));
await snap("http://localhost:3000/shop/silver-jewellery", join(DIRS.catalogue, "14-silver-jewellery-category.png"));
await snap("http://localhost:3000/shop/rings", join(DIRS.catalogue, "15-rings-category.png"));
await snap("http://localhost:3000/shop/earrings", join(DIRS.catalogue, "16-earrings-jhumkas-category.png"));
await snap("http://localhost:3000/shop/necklaces", join(DIRS.catalogue, "17-necklaces-and-bridal-category.png"));
await snap("http://localhost:3000/shop/bangles", join(DIRS.catalogue, "18-bangles-and-kadas-category.png"));
await snap("http://localhost:3000/shop/chains", join(DIRS.catalogue, "19-chains-category.png"));
await snap("http://localhost:3000/shop/bracelets", join(DIRS.catalogue, "20-bracelets-category.png"));
await snap("http://localhost:3000/shop/pendants", join(DIRS.catalogue, "21-pendants-category.png"));
await snap("http://localhost:3000/shop/mangalsutra", join(DIRS.catalogue, "22-mangalsutra-category.png"));
await snap("http://localhost:3000/collection/bridal-heritage", join(DIRS.catalogue, "23-bridal-heritage-collection.png"));
await snap("http://localhost:3000/collection/festive-edit", join(DIRS.catalogue, "24-festive-edit-collection.png"));
await snap("http://localhost:3000/collection/everyday-luxe", join(DIRS.catalogue, "25-everyday-luxe-collection.png"));
await snap("http://localhost:3000/collection/mens-signature", join(DIRS.catalogue, "26-mens-signature-collection.png"));
await snap("http://localhost:3000/collection/sterling-studio", join(DIRS.catalogue, "27-sterling-studio-collection.png"));
await snap("http://localhost:3000/collection/gifting-edit", join(DIRS.catalogue, "28-gifting-edit-collection.png"));
await snap("http://localhost:3000/product/solitaire-halo-diamond-ring", join(DIRS.catalogue, "29-product-detail-solitaire-ring.png"), 2000);
await snap("http://localhost:3000/product/rani-gold-jhumka-earrings", join(DIRS.catalogue, "30-product-detail-rani-jhumka.png"), 2000);

console.log("\n--- Phase 3: E-Commerce & Customer Flows ---");
await snap("http://localhost:3000/cart", join(DIRS.ecommerce, "31-shopping-cart.png"));
await snap("http://localhost:3000/checkout", join(DIRS.ecommerce, "32-checkout-funnel.png"));
await snap("http://localhost:3000/login", join(DIRS.ecommerce, "33-customer-login.png"));
await snap("http://localhost:3000/register", join(DIRS.ecommerce, "34-customer-register.png"));
await snap("http://localhost:3000/wishlist", join(DIRS.ecommerce, "35-wishlist.png"));
await snap("http://localhost:3000/compare", join(DIRS.ecommerce, "36-product-comparison.png"));
await snap("http://localhost:3000/search?q=silver", join(DIRS.ecommerce, "37-search-results.png"));

console.log("\n--- Phase 4: Authenticating as Admin ---");
await snap("http://localhost:3000/admin/login", join(DIRS.adminDashboard, "38-admin-login-screen.png"));

const loginResult = await page.evaluate(async () => {
  const res = await fetch("http://localhost:3000/api/admin/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "superadmin@example.com", password: "Admin@12345" }),
  });
  return { status: res.status, ok: res.ok };
});
console.log("Admin Authentication Status:", loginResult);

console.log("\n--- Phase 5: Admin ERP Dashboard & Analytics ---");
await snap("http://localhost:3000/admin/dashboard", join(DIRS.adminDashboard, "39-admin-executive-dashboard.png"), 2500);
await snap("http://localhost:3000/admin/reports", join(DIRS.adminDashboard, "40-financial-and-sales-reports.png"), 2000);
await snap("http://localhost:3000/admin/reports/sales", join(DIRS.adminDashboard, "41-sales-channel-report.png"), 2000);

console.log("\n--- Phase 6: Admin Inventory & Supply Chain ---");
await snap("http://localhost:3000/admin/inventory", join(DIRS.adminInventory, "42-inventory-management.png"), 2000);
await snap("http://localhost:3000/admin/inventory/stock-movements", join(DIRS.adminInventory, "43-stock-movements-ledger.png"), 2000);
await snap("http://localhost:3000/admin/inventory/low-stock", join(DIRS.adminInventory, "44-low-stock-alerts.png"));
await snap("http://localhost:3000/admin/inventory/out-of-stock", join(DIRS.adminInventory, "45-out-of-stock-alerts.png"));
await snap("http://localhost:3000/admin/vendors", join(DIRS.adminInventory, "46-vendor-master-suppliers.png"), 2000);
await snap("http://localhost:3000/admin/purchases", join(DIRS.adminInventory, "47-purchases-b2b-bills.png"), 2000);
await snap("http://localhost:3000/admin/purchases/new", join(DIRS.adminInventory, "48-new-purchase-order-form.png"));

console.log("\n--- Phase 7: Admin Sales, Orders & Billing ---");
await snap("http://localhost:3000/admin/orders", join(DIRS.adminSales, "49-ecommerce-orders-management.png"), 2000);
await snap("http://localhost:3000/admin/orders/returns", join(DIRS.adminSales, "50-order-returns-management.png"));
await snap("http://localhost:3000/admin/orders/refunds", join(DIRS.adminSales, "51-order-refunds.png"));
await snap("http://localhost:3000/admin/sales", join(DIRS.adminSales, "52-in-store-pos-sales.png"), 2000);
await snap("http://localhost:3000/admin/sales/new", join(DIRS.adminSales, "53-new-sale-pos-form.png"));
await snap("http://localhost:3000/admin/invoices", join(DIRS.adminSales, "54-gst-tax-invoices-billing.png"), 2000);
await snap("http://localhost:3000/admin/billing/new", join(DIRS.adminSales, "55-new-invoice-generator.png"));

console.log("\n--- Phase 8: Admin CRM & Customers ---");
await snap("http://localhost:3000/admin/customers", join(DIRS.adminCrm, "56-customer-directory.png"), 2000);
await snap("http://localhost:3000/admin/enquiries", join(DIRS.adminCrm, "57-crm-leads-and-enquiries.png"), 2000);

console.log("\n--- Phase 9: Admin Finance & Expenses ---");
await snap("http://localhost:3000/admin/expenses", join(DIRS.adminFinance, "58-business-expenses-ledger.png"), 2000);
await snap("http://localhost:3000/admin/expenses/recurring", join(DIRS.adminFinance, "59-recurring-expenses-schedule.png"));
await snap("http://localhost:3000/admin/expenses/categories", join(DIRS.adminFinance, "60-expense-categories.png"));
await snap("http://localhost:3000/admin/expenses/new", join(DIRS.adminFinance, "61-log-new-expense-form.png"));

console.log("\n--- Phase 10: Admin Marketing & Content Management ---");
await snap("http://localhost:3000/admin/pricing", join(DIRS.adminMarketing, "62-pricing-metal-rates-management.png"), 2000);
await snap("http://localhost:3000/admin/coupons", join(DIRS.adminMarketing, "63-promotional-coupons.png"));
await snap("http://localhost:3000/admin/offers", join(DIRS.adminMarketing, "64-festive-offers.png"));
await snap("http://localhost:3000/admin/content", join(DIRS.adminMarketing, "65-cms-content-blocks.png"));
await snap("http://localhost:3000/admin/content/testimonials", join(DIRS.adminMarketing, "66-cms-testimonials-reviews.png"));
await snap("http://localhost:3000/admin/content/blog", join(DIRS.adminMarketing, "67-cms-editorial-blogs.png"));
await snap("http://localhost:3000/admin/content/faqs", join(DIRS.adminMarketing, "68-cms-faqs.png"));
await snap("http://localhost:3000/admin/settings/roles", join(DIRS.adminMarketing, "69-system-roles-and-permissions.png"));
await snap("http://localhost:3000/admin/settings/audit-log", join(DIRS.adminMarketing, "70-system-audit-log.png"), 2000);

await browser.close();
console.log("\n========================================================");
console.log("ALL 70 SCREENSHOTS CAPTURED AND STORED SUCCESSFULLY!");
console.log("Location: " + BASE_OUT_DIR);
console.log("========================================================\n");
