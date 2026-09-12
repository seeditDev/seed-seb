import React, { useState, useEffect } from 'react';
import { FaStar, FaCheck, FaTimes, FaShieldAlt, FaSyncAlt, FaInfoCircle, FaLock } from 'react-icons/fa';
import { SUBSCRIPTION_PLANS, getSubscriptionPlans } from '../services/razorpayService';
import { db } from '../lib/firebase-config';
import { doc, getDoc, collection, query, where, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore';
import { checkSubscriptionStatus } from '../services/subscriptionValidator';

export default function PremiumUpgradeModal({ isOpen, onClose, user, onUpgradeSuccess }) {
  const [plans, setPlans] = useState(SUBSCRIPTION_PLANS);
  const [selectedPlanId, setSelectedPlanId] = useState('premium_annual');
  const [verifying, setVerifying] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  useEffect(() => {
    let isMounted = true;
    getSubscriptionPlans().then((loadedPlans) => {
      if (isMounted && loadedPlans && loadedPlans.length) {
        setPlans(loadedPlans);
      }
    }).catch(() => {});
    return () => { isMounted = false; };
  }, []);

  if (!isOpen) return null;

  const selectedPlan = plans.find(p => p.id === selectedPlanId) || plans[0];

  const handleVerifyStatus = async () => {
    if (!user?.uid) {
      setStatusMsg({ type: 'error', text: 'You must be signed in to verify your subscription.' });
      return;
    }

    setVerifying(true);
    setStatusMsg(null);

    try {
      const userRef = doc(db, 'users', user.uid);
      const snap = await getDoc(userRef);

      if (!snap.exists()) {
        setStatusMsg({ type: 'error', text: 'User profile not found in database.' });
        return;
      }

      const userData = snap.data();

      // 1. Query payments collection to verify genuine Razorpay transaction
      const paymentsRef = collection(db, 'payments');
      const paymentsQuery = query(
        paymentsRef,
        where('userId', '==', user.uid),
        where('status', '==', 'success')
      );
      const paymentsSnap = await getDocs(paymentsQuery);

      let activePayment = null;
      paymentsSnap.docs.forEach((docSnap) => {
        const pData = docSnap.data();
        const endMs = pData.premiumEndDate ? new Date(pData.premiumEndDate).getTime() : NaN;
        if (!isNaN(endMs) && endMs > Date.now()) {
          if (!activePayment || endMs > new Date(activePayment.premiumEndDate).getTime()) {
            activePayment = { id: docSnap.id, ...pData };
          }
        }
      });

      // 2. Check for active campus institution license
      const isInstitutionPro = Boolean(userData.cohortIsPremium || userData.institutionIsPremium || userData.tenantIsPremium);
      const institutionEndDateStr = userData.cohortPremiumEndDate || userData.tenantPremiumEndDate;
      const instEndMs = institutionEndDateStr ? new Date(institutionEndDateStr).getTime() : NaN;
      const hasActiveInstitution = isInstitutionPro && (!isNaN(instEndMs) ? Date.now() <= instEndMs : true);

      if (activePayment) {
        const expiryDate = new Date(activePayment.premiumEndDate).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        });
        setStatusMsg({
          type: 'success',
          text: `Verified! Active SEED Premium (${activePayment.planName || 'Annual Pro'}) confirmed until ${expiryDate}.`,
        });

        // Update user document in Firestore to persist verified status
        await updateDoc(userRef, {
          isPremium: true,
          premium: true,
          subscriptionStatus: 'active',
          premiumPlan: activePayment.planId || 'premium_annual',
          premiumStartDate: activePayment.premiumStartDate || new Date().toISOString(),
          premiumEndDate: activePayment.premiumEndDate,
          lastPaymentId: activePayment.paymentId || activePayment.id,
          updatedAt: serverTimestamp(),
        });

        // Update local session
        try {
          const cached = JSON.parse(localStorage.getItem('auth_data') || '{}');
          if (cached) {
            cached.isPremium = true;
            cached.premium = true;
            cached.subscriptionStatus = 'active';
            cached.premiumPlan = activePayment.planId || 'premium_annual';
            cached.premiumStartDate = activePayment.premiumStartDate;
            cached.premiumEndDate = activePayment.premiumEndDate;
            cached.lastPaymentId = activePayment.paymentId || activePayment.id;
            localStorage.setItem('auth_data', JSON.stringify(cached));
          }
        } catch (_) {}

        if (onUpgradeSuccess) {
          onUpgradeSuccess({
            success: true,
            isPremium: true,
            plan: activePayment.planId || 'premium_annual',
            endDate: activePayment.premiumEndDate,
          });
        }

        setTimeout(() => onClose(), 2000);
      } else if (hasActiveInstitution) {
        const instExpiry = !isNaN(instEndMs)
          ? new Date(instEndMs).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
          : 'Campus Session';
        setStatusMsg({
          type: 'success',
          text: `Verified! Campus Pro License confirmed active (${instExpiry}).`,
        });
        if (onUpgradeSuccess) {
          onUpgradeSuccess({
            success: true,
            isPremium: true,
            plan: 'institution_pro',
            endDate: institutionEndDateStr || null,
          });
        }
        setTimeout(() => onClose(), 2000);
      } else {
        // No valid payment and no campus license: clean up any stale flags
        if (userData.isPremium || userData.subscriptionStatus === 'active') {
          await updateDoc(userRef, {
            isPremium: false,
            premium: false,
            subscriptionStatus: 'none',
            updatedAt: serverTimestamp(),
          }).catch(() => {});

          try {
            const cached = JSON.parse(localStorage.getItem('auth_data') || '{}');
            if (cached) {
              cached.isPremium = false;
              cached.premium = false;
              cached.subscriptionStatus = 'none';
              localStorage.setItem('auth_data', JSON.stringify(cached));
            }
          } catch (_) {}
        }

        setStatusMsg({
          type: 'error',
          text: 'No active subscription or completed payment found. Please purchase SEED Premium on seedit.site first.',
        });
      }
    } catch (err) {
      console.error('[PremiumUpgradeModal] Verification error:', err);
      setStatusMsg({
        type: 'error',
        text: 'Network error verifying status: ' + (err?.message || 'Please check your connection.'),
      });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 10, 20, 0.88)',
        backdropFilter: 'blur(10px)',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          background: 'linear-gradient(180deg, #111827 0%, #0b1120 100%)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          borderRadius: '20px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 40px rgba(245, 158, 11, 0.15)',
          color: '#f3f4f6',
          padding: '28px',
          position: 'relative',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ambient Top Glow */}
        <div
          style={{
            position: 'absolute',
            top: '-60px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '280px',
            height: '120px',
            background: 'radial-gradient(circle, rgba(245, 158, 11, 0.35) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '18px',
            right: '18px',
            background: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '50%',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#9ca3af',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
        >
          <FaTimes size={14} />
        </button>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '54px',
              height: '54px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              boxShadow: '0 8px 24px rgba(245, 158, 11, 0.35)',
              marginBottom: '14px',
            }}
          >
            <FaStar size={26} color="#ffffff" />
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: '800', margin: '0 0 6px 0', letterSpacing: '-0.02em', color: '#ffffff' }}>
            SEED Premium Membership
          </h2>
          <p style={{ fontSize: '13.5px', color: '#9ca3af', margin: 0 }}>
            Purchases and subscriptions are managed on the web portal.
          </p>
        </div>

        {/* Active Premium Card if user is already Pro */}
        {(() => {
          const sub = checkSubscriptionStatus(user);
          if (sub.isPremium && sub.status === 'active') {
            return (
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.1) 100%)',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <FaStar style={{ color: '#10b981', fontSize: '18px' }} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#34d399' }}>
                      Active {sub.plan === 'premium_annual' ? 'Annual Pro' : 'Monthly'} Membership
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                      Expires on {new Date(sub.endDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} ({sub.daysLeft} days remaining)
                    </div>
                  </div>
                </div>
                <span style={{ fontSize: '11px', fontWeight: '800', background: 'rgba(16, 185, 129, 0.25)', color: '#34d399', padding: '3px 8px', borderRadius: '10px' }}>
                  ACTIVE
                </span>
              </div>
            );
          }
          return null;
        })()}

        {/* Plan Cards Selection */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '18px' }}>
          {plans.map((plan) => {
            const isSelected = plan.id === selectedPlanId;
            return (
              <div
                key={plan.id}
                onClick={() => setSelectedPlanId(plan.id)}
                style={{
                  position: 'relative',
                  padding: '16px',
                  borderRadius: '14px',
                  border: isSelected ? '2px solid #f59e0b' : '1px solid rgba(255, 255, 255, 0.1)',
                  background: isSelected ? 'rgba(245, 158, 11, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  textAlign: 'left',
                }}
              >
                {plan.popular && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-10px',
                      right: '12px',
                      background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                      color: '#000',
                      fontSize: '10px',
                      fontWeight: '800',
                      padding: '2px 8px',
                      borderRadius: '10px',
                      textTransform: 'uppercase',
                    }}
                  >
                    BEST VALUE
                  </span>
                )}
                <div style={{ fontSize: '12px', fontWeight: '600', color: isSelected ? '#fbbf24' : '#9ca3af', marginBottom: '4px' }}>
                  {plan.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '24px', fontWeight: '800', color: '#ffffff' }}>₹{plan.priceINR}</span>
                  <span style={{ fontSize: '13px', color: '#6b7280', textDecoration: 'line-through' }}>₹{plan.originalPriceINR}</span>
                </div>
                <div style={{ fontSize: '11px', color: '#10b981', fontWeight: '700' }}>
                  {plan.savingsPct} · {plan.duration}
                </div>
              </div>
            );
          })}
        </div>

        {/* Benefits Checklist */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '12px',
            padding: '14px 16px',
            marginBottom: '16px',
          }}
        >
          <div style={{ fontSize: '11.5px', fontWeight: '700', color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
            What you get with SEED Premium:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {selectedPlan.features.map((feat, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12.5px', color: '#d1d5db' }}>
                <span
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#10b981',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <FaCheck size={9} />
                </span>
                <span>{feat}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Secure Browser Lockdown Notice */}
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            borderRadius: '10px',
            padding: '12px 14px',
            marginBottom: '16px',
            fontSize: '12.5px',
            color: '#fef3c7',
            lineHeight: '1.45',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
          }}
        >
          <FaLock style={{ color: '#f59e0b', marginTop: '2px', flexShrink: 0 }} />
          <div>
            <strong>How to Subscribe:</strong> Please open <strong>https://seedit.site</strong> in your regular desktop browser to complete your subscription. SEED-SEB does not open external web browsers for security reasons. Once purchased, click the button below to verify and unlock your account.
          </div>
        </div>

        {/* Status Alerts */}
        {statusMsg && (
          <div
            style={{
              padding: '11px 14px',
              borderRadius: '8px',
              background: statusMsg.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.12)',
              border: `1px solid ${statusMsg.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              color: statusMsg.type === 'success' ? '#34d399' : '#f87171',
              fontSize: '12.5px',
              marginBottom: '14px',
              textAlign: 'center',
              lineHeight: '1.4',
            }}
          >
            {statusMsg.text}
          </div>
        )}

        {/* Action Button: Strictly Verify Status */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleVerifyStatus}
            disabled={verifying}
            style={{
              flex: 1,
              padding: '13px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              color: '#000000',
              fontWeight: '800',
              fontSize: '14px',
              border: 'none',
              cursor: verifying ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 16px rgba(245, 158, 11, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              opacity: verifying ? 0.75 : 1,
              transition: 'all 0.15s ease',
            }}
          >
            <FaSyncAlt size={13} className={verifying ? 'fa-spin' : ''} />
            {verifying ? 'Verifying Subscription...' : 'Verify Subscription Status'}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '13px 20px',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#cbd5e1',
              fontWeight: '700',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>

        {/* Security Trust Note */}
        <div
          style={{
            marginTop: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            fontSize: '11px',
            color: '#6b7280',
          }}
        >
          <FaShieldAlt color="#10b981" /> Exam lockdown active: External browser links are disabled.
        </div>
      </div>
    </div>
  );
}
