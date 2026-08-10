// Lazily loads Razorpay's Checkout script once, shared across every caller
// that opens a real (non-mock) Razorpay Checkout in this app — currently
// the patient booking flow (BookingWidget.tsx) and the doctor plan-upgrade
// checkout (UpgradeCheckoutDialog.tsx).
let razorpayCheckoutPromise: Promise<void> | null = null;

export const loadRazorpayCheckout = (): Promise<void> => {
  if ((window as any).Razorpay) return Promise.resolve();
  if (razorpayCheckoutPromise) return razorpayCheckoutPromise;
  razorpayCheckoutPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      razorpayCheckoutPromise = null;
      reject(new Error("Failed to load the payment gateway"));
    };
    document.body.appendChild(script);
  });
  return razorpayCheckoutPromise;
};
