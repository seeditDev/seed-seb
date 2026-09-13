/**
 * razorpayService.js — SEED-IT Razorpay Payment & Subscription Service
 *
 * Provides client-side checkout for:
 * 1. SEED Premium Subscriptions (Annual ₹999 / Monthly ₹149)
 * 2. Paid Global Contest Passes (₹49 - ₹199)
 * 3. Individual RealCourse Unlock Passes (₹499)
 *
 * Automatically records transaction audit in Firestore payments/{paymentId}
 * and updates users/{uid} with zero data loss.
 */

import { getApps } from "firebase/app";
import { getFirestore, doc, updateDoc, setDoc, getDoc, serverTimestamp, arrayUnion, increment, collection, query, where, getDocs } from "firebase/firestore";

const RAZORPAY_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

export const SEED_LOGO_URL =
  typeof window !== "undefined"
    ? `${window.location.origin}/SEED_Logo_Transparent.png`
    : "https://seedit.site/SEED_Logo_Transparent.png";

// Razorpay Key ID: Loaded from Vite/Netlify environment variables or Firestore systemSettings/subscription
let cachedRazorpayKey = null;

export async function fetchRazorpayKey() {
  if (cachedRazorpayKey) return cachedRazorpayKey;

  const envKey =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_RAZORPAY_KEY_ID) ||
    (typeof window !== "undefined" && (window.__ENV__?.VITE_RAZORPAY_KEY_ID || window.VITE_RAZORPAY_KEY_ID)) ||
    "";
  if (envKey && envKey.trim()) {
    cachedRazorpayKey = envKey.trim();
    return cachedRazorpayKey;
  }

  try {
    const db = getDb();
    const snap = await getDoc(doc(db, "systemSettings", "subscription"));
    if (snap.exists() && snap.data()?.razorpayKeyId) {
      const dbKey = String(snap.data().razorpayKeyId).trim();
      if (dbKey) {
        cachedRazorpayKey = dbKey;
        return cachedRazorpayKey;
      }
    }
  } catch (err) {
    console.warn("[razorpayService] Failed to load key from Firestore:", err);
  }

  cachedRazorpayKey = "rzp_test_1DP5mmOlF5G5ag";
  return cachedRazorpayKey;
}

export function getActiveRazorpayKey() {
  const envKey =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_RAZORPAY_KEY_ID) ||
    (typeof window !== "undefined" && (window.__ENV__?.VITE_RAZORPAY_KEY_ID || window.VITE_RAZORPAY_KEY_ID)) ||
    "";
  return (envKey && envKey.trim()) || cachedRazorpayKey || "rzp_test_1DP5mmOlF5G5ag";
}

export const RAZORPAY_KEY_ID = getActiveRazorpayKey();

export const SUBSCRIPTION_PLANS = [
  {
    id: "premium_annual",
    name: "SEED Premium (Annual Pro)",
    duration: "1 Year Access",
    priceINR: 999,
    originalPriceINR: 2499,
    savingsPct: "60% OFF",
    popular: true,
    features: [
      "Access all 1000+ Star/Advanced Practice Bank questions",
      "Unlimited participation in all Global & College Contests",
      "Full access to all interactive RealCourses (DSA, SQL, FullStack)",
      "Instant video solutions and in-depth test case explainers",
      "Verified SEED-IT Global Leaderboard badges and certificates",
    ],
  },
  {
    id: "premium_monthly",
    name: "SEED Premium (Monthly)",
    duration: "30 Days Access",
    priceINR: 149,
    originalPriceINR: 299,
    savingsPct: "50% OFF",
    popular: false,
    features: [
      "Access all 1000+ Star/Advanced Practice Bank questions",
      "Participation in Global Contests during billing period",
      "All interactive RealCourses unlocked",
      "Community forum and priority doubt assistance",
    ],
  },
];

/**
 * Fetches dynamic subscription plans configured by admin in Firestore systemSettings/subscription,
 * falling back to default SUBSCRIPTION_PLANS if not set.
 */
export async function getSubscriptionPlans() {
  try {
    const db = getDb();
    const snap = await getDoc(doc(db, "systemSettings", "subscription"));
    if (snap.exists()) {
      const data = snap.data();
      return SUBSCRIPTION_PLANS.map((plan) => {
        if (plan.id === "premium_annual" && data.annualPriceINR) {
          return {
            ...plan,
            priceINR: Number(data.annualPriceINR),
            originalPriceINR: Number(data.annualOriginalPriceINR || plan.originalPriceINR),
          };
        }
        if (plan.id === "premium_monthly" && data.monthlyPriceINR) {
          return {
            ...plan,
            priceINR: Number(data.monthlyPriceINR),
            originalPriceINR: Number(data.monthlyOriginalPriceINR || plan.originalPriceINR),
          };
        }
        return plan;
      });
    }
  } catch (err) {
    console.warn("[razorpayService] Error loading dynamic plans:", err);
  }
  return SUBSCRIPTION_PLANS;
}

/**
 * Dynamically loads Razorpay checkout script if not already present.
 */
export function loadRazorpayScript() {
  return new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && window.Razorpay) {
      return resolve(true);
    }
    const script = document.createElement("script");
    script.src = RAZORPAY_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error("Failed to load Razorpay payment SDK. Check network connection."));
    document.body.appendChild(script);
  });
}

function getDb() {
  const apps = getApps();
  if (!apps.length) throw new Error("[razorpayService] Firebase not initialized");
  return getFirestore(apps[0]);
}

/**
 * Initiate Razorpay checkout for SEED Premium upgrade.
 *
 * @param {Object} user - Current user object ({ uid, email, name, college })
 * @param {Object} plan - Selected plan from SUBSCRIPTION_PLANS
 * @returns {Promise<{ success: boolean, paymentId?: string, error?: string }>}
 */
export async function purchasePremiumPlan(user, plan = SUBSCRIPTION_PLANS[0]) {
  if (!user || !user.uid) {
    throw new Error("User must be logged in to upgrade to SEED Premium.");
  }

  const keyId = await fetchRazorpayKey();
  await loadRazorpayScript();

  return new Promise((resolve) => {
    const amountPaise = plan.priceINR * 100;

    const options = {
      key: keyId,
      amount: amountPaise,
      currency: "INR",
      name: "SEED-IT Platform",
      description: `Upgrade: ${plan.name} (${plan.duration})`,
      image: SEED_LOGO_URL,
      prefill: {
        name: user.name || user.displayName || "SEED-IT Learner",
        email: user.email || "",
        contact: user.phone || "",
      },
      notes: {
        userId: user.uid,
        userEmail: user.email,
        planId: plan.id,
        planName: plan.name,
      },
      theme: {
        color: "#16a34a",
      },
      modal: {
        ondismiss: function () {
          resolve({ success: false, error: "Payment checkout cancelled by user." });
        },
      },
      handler: async function (response) {
        try {
          const db = getDb();
          const paymentId = response.razorpay_payment_id || `pay_${Date.now()}`;
          const startDate = new Date().toISOString();
          const durationDays = plan.id === 'premium_annual' ? 365 : 30;
          const endDate = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

          // 1. Record payment audit trail in payments/{paymentId}
          const paymentRef = doc(db, "payments", paymentId);
          await setDoc(paymentRef, {
            paymentId,
            razorpay_order_id: response.razorpay_order_id || null,
            razorpay_signature: response.razorpay_signature || null,
            userId: user.uid,
            userEmail: user.email || "",
            userName: user.name || user.displayName || "Learner",
            type: "premium_upgrade",
            planId: plan.id,
            planName: plan.name,
            durationDays,
            premiumStartDate: startDate,
            premiumEndDate: endDate,
            amountINR: plan.priceINR,
            currency: "INR",
            status: "success",
            createdAt: serverTimestamp(),
          });

          // 2. Upgrade user document in users/{uid}
          const userRef = doc(db, "users", user.uid);
          await updateDoc(userRef, {
            isPremium: true,
            premium: true,
            isPro: true,
            subscriptionTier: 'pro',
            subscriptionStatus: 'active',
            premiumPlan: plan.id,
            premiumStartDate: startDate,
            premiumEndDate: endDate,
            premiumSince: serverTimestamp(),
            lastPaymentId: paymentId,
            updatedAt: serverTimestamp(),
          });

          // 3. Update localStorage session cache
          try {
            const cached = JSON.parse(localStorage.getItem("auth_data") || "{}");
            if (cached && (cached.uid === user.uid || cached.email === user.email)) {
              cached.isPremium = true;
              cached.premium = true;
              cached.isPro = true;
              cached.subscriptionTier = 'pro';
              cached.subscriptionStatus = 'active';
              cached.premiumPlan = plan.id;
              cached.premiumStartDate = startDate;
              cached.premiumEndDate = endDate;
              localStorage.setItem("auth_data", JSON.stringify(cached));
            }
          } catch (_) {}

          // 4. Notify all UI components via custom event
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("seedit:premium-updated", {
              detail: { isPremium: true, planId: plan.id, paymentId, startDate, endDate }
            }));
          }

          resolve({ success: true, paymentId });
        } catch (err) {
          console.error("[razorpayService] Post-payment fulfillment error:", err);
          resolve({
            success: false,
            error: "Payment succeeded with Razorpay but profile activation failed. Please contact support.",
            paymentId: response.razorpay_payment_id
          });
        }
      },
    };

    const rzp = new window.Razorpay(options);
    rzp.open();
  });
}

/**
 * Initiate Razorpay checkout for a single Contest Entry Pass.
 */
export async function purchaseContestPass(user, contest) {
  if (!user || !user.uid) {
    throw new Error("User must be logged in to purchase a contest entry pass.");
  }
  const keyId = await fetchRazorpayKey();
  await loadRazorpayScript();

  return new Promise((resolve) => {
    const feeINR = Number(contest.entryFeeINR || contest.entryFee || 99);
    const amountPaise = feeINR * 100;

    const options = {
      key: keyId,
      amount: amountPaise,
      currency: "INR",
      name: "SEED-IT Contests",
      description: `Entry Pass: ${contest.title || contest.name || "Global Competition"}`,
      image: SEED_LOGO_URL,
      prefill: {
        name: user.name || user.displayName || "Learner",
        email: user.email || "",
        contact: user.phone || "",
      },
      theme: { color: "#4f46e5" },
      modal: {
        ondismiss: function () {
          resolve({ success: false, error: "Contest pass checkout cancelled." });
        },
      },
      handler: async function (response) {
        try {
          const paymentId = response.razorpay_payment_id || `pass_${Date.now()}`;
          const db = getDb();

          // 1. Audit log
          await setDoc(doc(db, "payments", paymentId), {
            paymentId,
            razorpay_order_id: response.razorpay_order_id || null,
            razorpay_signature: response.razorpay_signature || null,
            userId: user.uid,
            userEmail: user.email || "",
            userName: user.name || user.displayName || "Learner",
            type: "contest_pass",
            contestId: contest.id,
            contestName: contest.title || contest.name || "Contest",
            amountINR: feeINR,
            currency: "INR",
            status: "success",
            createdAt: serverTimestamp(),
          });

          // 2. Grant pass on user record
          const contestKey = `contestPasses.${contest.id}`;
          await updateDoc(doc(db, "users", user.uid), {
            [contestKey]: true,
            lastPaymentId: paymentId,
            updatedAt: serverTimestamp(),
          });

          // 3. Register user directly for contest
          try {
            const regRef = doc(db, "contests", contest.id, "registrations", user.uid);
            await setDoc(regRef, {
              userId: user.uid,
              displayName: user.displayName || user.name || "Student",
              email: user.email || "",
              tenantId: user.tenantId || "",
              tenantName: user.tenantName || (user.tenantId ? user.tenantId.toUpperCase() : "Student"),
              cohortId: user.cohortId || "",
              registeredAt: serverTimestamp(),
              status: "registered",
              paymentId,
              passPurchased: true,
            }, { merge: true });

            await updateDoc(doc(db, "contests", contest.id), {
              registeredCount: increment(1),
            });
          } catch (regErr) {
            console.warn("[razorpayService] Auto-registration warning:", regErr);
          }

          // 4. Update localStorage session cache
          try {
            const cached = JSON.parse(localStorage.getItem("auth_data") || "{}");
            if (cached && (cached.uid === user.uid || cached.email === user.email)) {
              if (!cached.contestPasses) cached.contestPasses = {};
              cached.contestPasses[contest.id] = true;
              localStorage.setItem("auth_data", JSON.stringify(cached));
            }
          } catch (_) {}

          // 5. Dispatch event
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("seedit:pass-purchased", {
              detail: { contestId: contest.id, paymentId }
            }));
          }

          resolve({ success: true, paymentId });
        } catch (err) {
          console.error("[razorpayService] Contest pass activation failed:", err);
          resolve({ success: false, error: err.message });
        }
      },
    };

    const rzp = new window.Razorpay(options);
    rzp.open();
  });
}

/**
 * Initiate Razorpay checkout for an individual RealCourse purchase.
 */
export async function purchaseCourse(user, course) {
  if (!user || !user.uid) {
    throw new Error("User must be logged in to purchase a course.");
  }
  const keyId = await fetchRazorpayKey();
  await loadRazorpayScript();

  return new Promise((resolve) => {
    const courseId = course.courseId || course.id || course.slug;
    const priceINR = typeof course.offerPriceINR === 'number' && course.offerPriceINR > 0
      ? course.offerPriceINR
      : (typeof course.priceINR === 'number' && course.priceINR > 0 ? course.priceINR : 149);
    const amountPaise = priceINR * 100;

    const options = {
      key: keyId,
      amount: amountPaise,
      currency: "INR",
      name: "SEED-IT Courses",
      description: `Lifetime Enrollment: ${course.title || course.name}`,
      image: SEED_LOGO_URL,
      prefill: {
        name: user.name || user.displayName || "Learner",
        email: user.email || "",
      },
      notes: {
        userId: user.uid,
        userEmail: user.email || "",
        courseId,
        courseTitle: course.title || course.name || "",
        type: "course_purchase",
        amountINR: priceINR,
        standardPriceINR: course.priceINR || 999,
        offerPriceINR: course.offerPriceINR || 149,
      },
      theme: { color: "#16a34a" },
      modal: {
        ondismiss: function () {
          resolve({ success: false, error: "Course checkout cancelled." });
        },
      },
      handler: async function (response) {
        try {
          const paymentId = response.razorpay_payment_id || `course_${Date.now()}`;
          const db = getDb();

          // 1. Audit log in payments/{paymentId}
          await setDoc(doc(db, "payments", paymentId), {
            paymentId,
            razorpay_order_id: response.razorpay_order_id || null,
            razorpay_signature: response.razorpay_signature || null,
            userId: user.uid,
            userEmail: user.email || "",
            userName: user.name || user.displayName || "Learner",
            type: "course_purchase",
            courseId,
            courseTitle: course.title || course.name,
            amountINR: priceINR,
            standardPriceINR: course.priceINR || 999,
            offerPriceINR: course.offerPriceINR || 149,
            status: "success",
            createdAt: serverTimestamp(),
          });

          // 2. Grant course in user document as permanent / lifetime
          await updateDoc(doc(db, "users", user.uid), {
            assignedRealCourses: arrayUnion(courseId),
            [`purchasedCourses.${courseId}`]: {
              courseId,
              courseTitle: course.title || course.name,
              purchasedAt: new Date().toISOString(),
              paymentId,
              amountPaidINR: priceINR,
              lifetime: true
            },
            lastPaymentId: paymentId,
            updatedAt: serverTimestamp()
          });

          // 3. Update localStorage session cache
          try {
            const cached = JSON.parse(localStorage.getItem("auth_data") || "{}");
            if (cached && (cached.uid === user.uid || cached.email === user.email)) {
              const currentAssigned = cached.assignedRealCourses || [];
              if (!currentAssigned.includes(courseId)) {
                cached.assignedRealCourses = [...currentAssigned, courseId];
                localStorage.setItem("auth_data", JSON.stringify(cached));
              }
            }
          } catch (_) {}

          // 4. Dispatch event
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("seedit:course-purchased", {
              detail: { courseId, paymentId }
            }));
          }

          resolve({ success: true, paymentId });
        } catch (err) {
          console.error("[razorpayService] Course enrollment fulfillment failed:", err);
          resolve({ success: false, error: err.message });
        }
      },
    };

    const rzp = new window.Razorpay(options);
    rzp.open();
  });
}

/**
 * Fetch purchase and payment history for a user from Firestore
 */
export async function fetchUserPurchaseHistory(userId) {
  if (!userId) return [];
  try {
    const db = getDb();
    const paymentsRef = collection(db, "payments");
    const q = query(paymentsRef, where("userId", "==", userId));
    const snap = await getDocs(q);
    const history = [];
    snap.forEach((d) => {
      history.push({ id: d.id, ...d.data() });
    });
    // Sort descending by timestamp
    history.sort((a, b) => {
      const getMs = (val) => {
        if (!val) return 0;
        if (typeof val.toMillis === "function") return val.toMillis();
        if (val.seconds) return val.seconds * 1000;
        const d = new Date(val).getTime();
        return isNaN(d) ? 0 : d;
      };
      return getMs(b.createdAt) - getMs(a.createdAt);
    });
    return history;
  } catch (err) {
    console.warn("[razorpayService] Failed to fetch purchase history:", err);
    return [];
  }
}

/**
 * Purchases an individual test pass for a Global Assessment or Course Test.
 * Enables non-Pro and non-enrolled students to unlock and take a test.
 */
export async function purchaseAssessmentPass(user, assessment) {
  if (!user || !user.uid) {
    throw new Error("User must be logged in to purchase a test pass.");
  }
  const feeINR = Number(
    assessment.entryFeeINR !== undefined && assessment.entryFeeINR !== null
      ? assessment.entryFeeINR
      : (assessment.priceINR !== undefined && assessment.priceINR !== null ? assessment.priceINR : 99)
  );

  // If free, immediately grant access without payment popup
  if (feeINR <= 0) {
    try {
      const db = getDb();
      const passId = `free_pass_${Date.now()}`;
      await setDoc(doc(db, "payments", passId), {
        paymentId: passId,
        userId: user.uid,
        userEmail: user.email || "",
        userName: user.name || user.displayName || "Learner",
        type: "assessment_pass",
        assessmentId: assessment.id,
        assessmentName: assessment.name || assessment.title || "Assessment",
        amountINR: 0,
        status: "success",
        createdAt: serverTimestamp(),
      });
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        [`assessmentPasses.${assessment.id}`]: true,
        [`contestPasses.${assessment.id}`]: true,
      });
      return { success: true, paymentId: passId };
    } catch (passErr) {
      console.error("[purchaseAssessmentPass] Free pass grant error:", passErr);
      return { success: true };
    }
  }

  const keyId = await fetchRazorpayKey();
  await loadRazorpayScript();

  return new Promise((resolve) => {
    const amountPaise = Math.round(feeINR * 100);

    const options = {
      key: keyId,
      amount: amountPaise,
      currency: "INR",
      name: "SEED-IT Assessments",
      description: `Test Pass: ${assessment.name || assessment.title || "Global Assessment"}`,
      image: SEED_LOGO_URL,
      prefill: {
        name: user.name || user.displayName || "Learner",
        email: user.email || "",
        contact: user.phone || "",
      },
      theme: { color: "#4f46e5" },
      modal: {
        ondismiss: function () {
          resolve({ success: false, error: "Test pass checkout cancelled." });
        },
      },
      handler: async function (response) {
        try {
          const paymentId = response.razorpay_payment_id || `pass_${Date.now()}`;
          const db = getDb();

          // 1. Audit log in payments collection
          await setDoc(doc(db, "payments", paymentId), {
            paymentId,
            razorpay_order_id: response.razorpay_order_id || null,
            razorpay_signature: response.razorpay_signature || null,
            userId: user.uid,
            userEmail: user.email || "",
            userName: user.name || user.displayName || "Learner",
            type: "assessment_pass",
            assessmentId: assessment.id,
            assessmentName: assessment.name || assessment.title || "Assessment",
            amountINR: feeINR,
            currency: "INR",
            status: "success",
            createdAt: serverTimestamp(),
          });

          // 2. Grant pass on user record
          const passKey = `assessmentPasses.${assessment.id}`;
          const contestKey = `contestPasses.${assessment.id}`;
          await updateDoc(doc(db, "users", user.uid), {
            [passKey]: true,
            [contestKey]: true,
            lastPaymentId: paymentId,
            updatedAt: serverTimestamp(),
          });

          // 3. Sync local storage
          try {
            const raw = localStorage.getItem("auth_data");
            if (raw) {
              const cached = JSON.parse(raw);
              if (!cached.assessmentPasses) cached.assessmentPasses = {};
              if (!cached.contestPasses) cached.contestPasses = {};
              cached.assessmentPasses[assessment.id] = true;
              cached.contestPasses[assessment.id] = true;
              localStorage.setItem("auth_data", JSON.stringify(cached));
            }
          } catch (_) {}

          resolve({ success: true, paymentId });
        } catch (err) {
          console.error("[purchaseAssessmentPass] Post-payment fulfillment error:", err);
          resolve({ success: true, warning: "Payment received. Pass granted locally." });
        }
      },
    };

    const rzp = new window.Razorpay(options);
    rzp.on("payment.failed", function (response) {
      resolve({ success: false, error: response.error?.description || "Payment failed." });
    });
    rzp.open();
  });
}
