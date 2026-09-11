import React, { useState } from 'react';
import { FaStar, FaCheck, FaTimes, FaShieldAlt, FaExternalLinkAlt, FaSyncAlt } from 'react-icons/fa';
import { SUBSCRIPTION_PLANS } from '../services/razorpayService';
import { db } from '../lib/firebase-config';
import { doc, getDoc } from 'firebase/firestore';

const openExternalURL = (url) => {
  try {
    if (typeof window !== 'undefined' && window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(url);
      return;
    }
  } catch (_) {}
  window.open(url, '_blank', 'noopener,noreferrer');
};

export default function PremiumUpgradeModal({ isOpen, onClose, user, onUpgradeSuccess }) {
  const [selectedPlanId, setSelectedPlanId] = useState('premium_annual');
  const [refreshing, setRefreshing] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  if (!isOpen) return null;

  const selectedPlan = SUBSCRIPTION_PLANS.find(p => p.id === selectedPlanId) || SUBSCRIPTION_PLANS[0];

  const handleOpenWeb = () => {
    openExternalURL('https://seedit.site');
  };

  const handleRefreshStatus = async () => {
    if (!user?.uid) return;
    setRefreshing(true);
    setStatusMsg(null);
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists() && (snap.data().isPremium || snap.data().premium)) {
        setStatusMsg({ type: 'success', text: "Premium membership detected! Your account is now active." });
        if (onUpgradeSuccess) onUpgradeSuccess({ success: true, plan: snap.data().premiumPlan });
        setTimeout(() => onClose(), 1500);
      } else {
        setStatusMsg({ type: 'info', text: "No active subscription found yet. If you just completed checkout on seedit.site, please wait a moment and try again." });
      }
    } catch (e) {
      setStatusMsg({ type: 'error', text: "Unable to verify subscription: " + (e.message || "Network error") });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 10, 20, 0.85)',
        backdropFilter: 'blur(8px)',
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
            Upgrade to SEED Premium
          </h2>
          <p style={{ fontSize: '13.5px', color: '#9ca3af', margin: 0 }}>
            Purchases and subscriptions are managed on our official web portal.
          </p>
        </div>

        {/* Plan Cards Selection */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '18px' }}>
          {SUBSCRIPTION_PLANS.map((plan) => {
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
            marginBottom: '18px',
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

        {/* Notice Info Box */}
        <div
          style={{
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            borderRadius: '10px',
            padding: '10px 14px',
            marginBottom: '16px',
            fontSize: '12px',
            color: '#93c5fd',
            lineHeight: '1.45',
          }}
        >
          💡 <strong>Buying Policy:</strong> For maximum security, all payment checkouts (Razorpay, UPI, Cards) are executed on our website at <strong>seedit.site</strong>. Once upgraded, all courses and premium challenges immediately unlock here in SEED-SEB.
        </div>

        {/* Status Alerts */}
        {statusMsg && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: statusMsg.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.12)',
              border: `1px solid ${statusMsg.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              color: statusMsg.type === 'success' ? '#34d399' : '#f87171',
              fontSize: '12.5px',
              marginBottom: '14px',
              textAlign: 'center',
            }}
          >
            {statusMsg.text}
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            onClick={handleOpenWeb}
            style={{
              width: '100%',
              padding: '13px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              color: '#000000',
              fontWeight: '800',
              fontSize: '14.5px',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(245, 158, 11, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.15s ease',
            }}
          >
            <FaExternalLinkAlt size={13} /> Buy on seedit.site
          </button>

          <button
            onClick={handleRefreshStatus}
            disabled={refreshing}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#e2e8f0',
              fontWeight: '600',
              fontSize: '13px',
              cursor: refreshing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <FaSyncAlt size={12} className={refreshing ? 'fa-spin' : ''} />
            {refreshing ? 'Verifying status...' : "I've subscribed on Web (Sync Status)"}
          </button>
        </div>

        {/* Trust Badge */}
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
          <FaShieldAlt color="#10b981" /> Purchases processed securely via Razorpay at seedit.site
        </div>
      </div>
    </div>
  );
}
