import React, { useState, useEffect } from 'react';
import {
  FaCrown,
  FaCheckCircle,
  FaCalendarAlt,
  FaReceipt,
  FaCopy,
  FaCheck,
  FaExternalLinkAlt,
  FaShieldAlt,
  FaArrowRight,
  FaSpinner,
  FaTicketAlt,
  FaGraduationCap,
  FaBolt,
  FaClock,
} from 'react-icons/fa';
import { toast } from 'sonner';
import {
  fetchUserPurchaseHistory,
  getSubscriptionPlans,
  purchasePremiumPlan,
} from '../../services/razorpayService';

export default function PurchaseHistoryTab({ user = {}, onPlanPurchased, isSebEnvironment = false }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState('premium_annual');
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const isPro = Boolean(user?.isPremium || user?.isPro || user?.subscriptionTier === 'pro');
  const planName = user?.premiumPlan === 'premium_monthly' ? 'SEED Pro (Monthly)' : 'SEED Pro (Annual)';

  // Load history & plans
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setLoading(true);
      try {
        const [loadedPlans, userHistory] = await Promise.all([
          getSubscriptionPlans(),
          user?.uid ? fetchUserPurchaseHistory(user.uid) : Promise.resolve([]),
        ]);
        if (isMounted) {
          setPlans(loadedPlans || []);
          setHistory(userHistory || []);
        }
      } catch (err) {
        console.warn('[PurchaseHistoryTab] Error loading data:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, [user?.uid]);

  // Copy helper
  const handleCopyId = (id) => {
    if (!id) return;
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    toast.success('Payment ID copied to clipboard!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Checkout directly from this dedicated page
  const handleUpgrade = async (plan) => {
    if (isSebEnvironment) {
      toast.info(
        'Payments and Pro upgrades are disabled in SEED-SEB lockdown. Please visit the SEED Website (https://seedit.site/subscription) to upgrade.',
        { duration: 6000 }
      );
      return;
    }

    if (!user?.uid) {
      toast.error('Please log in to upgrade to SEED Pro.');
      return;
    }

    setIsCheckingOut(true);
    try {
      const res = await purchasePremiumPlan(user, plan);
      if (res.success) {
        toast.success(`🎉 Welcome to SEED Pro (${plan.name})! Your account is now active.`);
        if (onPlanPurchased) onPlanPurchased(plan);
        // Refresh history
        const refreshed = await fetchUserPurchaseHistory(user.uid);
        setHistory(refreshed);
      } else if (res.error && !res.error.includes('cancelled')) {
        toast.error(res.error);
      }
    } catch (err) {
      toast.error(err.message || 'Payment checkout failed.');
    } finally {
      setIsCheckingOut(false);
    }
  };

  // Format date helper
  const formatDate = (val) => {
    if (!val) return '—';
    try {
      let d;
      if (val.toDate && typeof val.toDate === 'function') {
        d = val.toDate();
      } else if (val.seconds) {
        d = new Date(val.seconds * 1000);
      } else {
        d = new Date(val);
      }
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (_) {
      return '—';
    }
  };

  // Calculate days remaining
  const calculateDaysRemaining = () => {
    if (!isPro || !user?.premiumEndDate) return null;
    try {
      const end = new Date(user.premiumEndDate).getTime();
      const now = Date.now();
      const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
      return diff > 0 ? diff : 0;
    } catch (_) {
      return null;
    }
  };

  const daysRemaining = calculateDaysRemaining();
  const contestPassesCount = user?.contestPasses ? Object.keys(user.contestPasses).length : 0;

  return (
    <div className="billing-portal-wrapper" style={{ padding: '24px 0', maxWidth: '1100px', margin: '0 auto' }}>
      {/* ── CARD 1: ACTIVE MEMBERSHIP STATUS ── */}
      <div
        className="membership-hero-card"
        style={{
          background: isPro
            ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(6, 78, 59, 0.25) 100%)'
            : 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%)',
          border: isPro ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '18px',
          padding: '28px',
          marginBottom: '32px',
          boxShadow: isPro ? '0 12px 36px rgba(16, 185, 129, 0.12)' : '0 8px 24px rgba(0, 0, 0, 0.3)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: isPro ? '#10b981' : '#64748b',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  padding: '4px 12px',
                  borderRadius: '999px',
                }}
              >
                <FaCrown size={11} /> {isPro ? 'Pro Member' : 'Free Tier'}
              </span>
              {isPro && (
                <span style={{ color: '#10b981', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <FaCheckCircle size={13} /> Active
                </span>
              )}
            </div>

            <h2 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary, #f8fafc)', margin: '4px 0 10px 0' }}>
              {isPro ? planName : 'Free Learner Tier'}
            </h2>

            <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '14px', maxWidth: '580px', margin: 0, lineHeight: 1.5 }}>
              {isPro
                ? 'Your Pro membership unlocks full access to 1000+ premium practice problems, global and college contests, real-time leaderboards, and exclusive RealCourses.'
                : 'You are currently on the free learner plan. Upgrade to SEED Pro to unlock 1000+ premium challenge problems, contest entry passes, and career roadmaps.'}
            </p>
          </div>

          {/* Right side stats badge */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {isPro && daysRemaining !== null && (
              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.25)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '14px 20px',
                  textAlign: 'center',
                  minWidth: '120px',
                }}
              >
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#10b981' }}>{daysRemaining}</div>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 600 }}>Days Left</div>
              </div>
            )}

            <div
              style={{
                background: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '14px 20px',
                textAlign: 'center',
                minWidth: '120px',
              }}
            >
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#38bdf8' }}>{contestPassesCount}</div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 600 }}>Contest Passes</div>
            </div>
          </div>
        </div>

        {/* Expiry sub-bar */}
        {isPro && user?.premiumEndDate && (
          <div
            style={{
              marginTop: '20px',
              paddingTop: '16px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '13px',
              color: '#94a3b8',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FaCalendarAlt /> Valid until: <strong style={{ color: '#f8fafc' }}>{formatDate(user.premiumEndDate)}</strong>
            </div>
            {user?.lastPaymentId && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>Payment Ref:</span>
                <code style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '2px 6px', borderRadius: '4px', fontSize: '12px', color: '#38bdf8' }}>
                  {user.lastPaymentId}
                </code>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── CARD 2: DEDICATED PLAN SELECTION & UPGRADE (FULL IN-PAGE CHECKOUT) ── */}
      <div style={{ marginBottom: '40px' }}>
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary, #f8fafc)', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FaBolt style={{ color: '#f59e0b' }} /> {isPro ? 'Extend or Switch Your Plan' : 'Choose Your Pro Membership'}
          </h3>
          <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '14px', margin: 0 }}>
            Transparent pricing with zero hidden charges. Direct in-page activation via Razorpay.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          {plans.map((p) => {
            const isSelected = selectedPlanId === p.id;
            const isAnnual = p.id === 'premium_annual';

            return (
              <div
                key={p.id}
                onClick={() => setSelectedPlanId(p.id)}
                style={{
                  background: isAnnual
                    ? 'linear-gradient(145deg, rgba(30, 41, 59, 0.85) 0%, rgba(15, 23, 42, 0.95) 100%)'
                    : 'rgba(15, 23, 42, 0.65)',
                  border: isSelected
                    ? '2px solid #10b981'
                    : isAnnual
                    ? '1px solid rgba(16, 185, 129, 0.3)'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '16px',
                  padding: '24px',
                  cursor: 'pointer',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  transition: 'all 0.2s ease',
                  boxShadow: isSelected
                    ? '0 8px 28px rgba(16, 185, 129, 0.18)'
                    : '0 4px 16px rgba(0, 0, 0, 0.2)',
                }}
              >
                {p.popular && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '16px',
                      right: '16px',
                      background: 'linear-gradient(90deg, #f59e0b, #d97706)',
                      color: '#ffffff',
                      fontSize: '11px',
                      fontWeight: 800,
                      padding: '3px 10px',
                      borderRadius: '999px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    BEST VALUE
                  </span>
                )}

                <div>
                  <h4 style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc', margin: '0 0 6px 0' }}>{p.name}</h4>
                  <div style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '16px' }}>{p.duration}</div>

                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '16px' }}>
                    <span style={{ fontSize: '32px', fontWeight: 900, color: '#10b981' }}>₹{p.priceINR}</span>
                    {p.originalPriceINR && (
                      <span style={{ fontSize: '16px', color: '#64748b', textDecoration: 'line-through' }}>
                        ₹{p.originalPriceINR}
                      </span>
                    )}
                    {p.savingsPct && (
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#f59e0b', background: 'rgba(245, 158, 11, 0.12)', padding: '2px 8px', borderRadius: '6px' }}>
                        {p.savingsPct}
                      </span>
                    )}
                  </div>

                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px 0' }}>
                    {(p.features || []).map((feat, idx) => (
                      <li
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '8px',
                          fontSize: '13px',
                          color: '#cbd5e1',
                          marginBottom: '8px',
                          lineHeight: 1.4,
                        }}
                      >
                        <FaCheckCircle style={{ color: '#10b981', flexShrink: 0, marginTop: '2px' }} />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUpgrade(p);
                  }}
                  disabled={isCheckingOut}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    background: isSelected ? '#10b981' : 'rgba(16, 185, 129, 0.15)',
                    color: isSelected ? '#ffffff' : '#10b981',
                    border: '1px solid #10b981',
                    fontWeight: 700,
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {isCheckingOut && selectedPlanId === p.id ? (
                    <>
                      <FaSpinner className="animate-spin" /> Processing…
                    </>
                  ) : (
                    <>
                      {isPro ? 'Extend Subscription' : 'Upgrade to Pro'} <FaArrowRight size={12} />
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── CARD 3: PURCHASE & BILLING HISTORY TABLE ── */}
      <div>
        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary, #f8fafc)', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FaReceipt style={{ color: '#38bdf8' }} /> Purchase &amp; Payment History
            </h3>
            <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '13px', margin: 0 }}>
              All completed membership upgrades, contest entry passes, and course enrollments.
            </p>
          </div>
          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
            {history.length} {history.length === 1 ? 'record' : 'records'}
          </span>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
            <FaSpinner className="animate-spin" size={24} style={{ marginBottom: '8px' }} />
            <div>Loading purchase history…</div>
          </div>
        ) : history.length === 0 ? (
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.4)',
              border: '1px dashed rgba(255, 255, 255, 0.1)',
              borderRadius: '14px',
              padding: '40px 20px',
              textAlign: 'center',
              color: '#94a3b8',
            }}
          >
            <FaReceipt size={36} style={{ color: '#475569', marginBottom: '12px' }} />
            <h4 style={{ color: '#f8fafc', fontSize: '16px', fontWeight: 700, margin: '0 0 6px 0' }}>No Purchases Yet</h4>
            <p style={{ fontSize: '13px', maxWidth: '400px', margin: '0 auto' }}>
              When you upgrade to SEED Pro, purchase a contest entry pass, or enroll in courses, your invoices and receipts will appear here.
            </p>
          </div>
        ) : (
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.65)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '14px',
              overflow: 'hidden',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
            }}
          >
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'rgba(0, 0, 0, 0.25)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ padding: '14px 18px' }}>Date</th>
                    <th style={{ padding: '14px 18px' }}>Item / Description</th>
                    <th style={{ padding: '14px 18px' }}>Type</th>
                    <th style={{ padding: '14px 18px' }}>Amount</th>
                    <th style={{ padding: '14px 18px' }}>Payment Ref</th>
                    <th style={{ padding: '14px 18px', textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item, idx) => {
                    const isCopied = copiedId === item.paymentId;
                    const itemType = item.type || 'subscription';
                    const isContest = itemType === 'contest_pass';
                    const isCourse = itemType === 'course_purchase';

                    return (
                      <tr
                        key={item.id || item.paymentId || idx}
                        style={{
                          borderBottom: idx < history.length - 1 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none',
                          transition: 'background 0.15s ease',
                        }}
                      >
                        {/* Date */}
                        <td style={{ padding: '14px 18px', color: '#cbd5e1', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <FaClock size={11} style={{ color: '#64748b' }} />
                            <span>{formatDate(item.createdAt)}</span>
                          </div>
                        </td>

                        {/* Item */}
                        <td style={{ padding: '14px 18px', color: '#f8fafc', fontWeight: 600 }}>
                          <div>{item.planName || item.contestName || item.courseTitle || 'SEED Pro Membership'}</div>
                          {item.durationDays && (
                            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 400 }}>
                              {item.durationDays} days access
                            </span>
                          )}
                        </td>

                        {/* Type badge */}
                        <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 700,
                              background: isContest
                                ? 'rgba(245, 158, 11, 0.12)'
                                : isCourse
                                ? 'rgba(56, 189, 248, 0.12)'
                                : 'rgba(16, 185, 129, 0.12)',
                              color: isContest ? '#f59e0b' : isCourse ? '#38bdf8' : '#10b981',
                            }}
                          >
                            {isContest ? <FaTicketAlt size={10} /> : isCourse ? <FaGraduationCap size={10} /> : <FaCrown size={10} />}
                            {isContest ? 'Contest Pass' : isCourse ? 'Course' : 'Subscription'}
                          </span>
                        </td>

                        {/* Amount */}
                        <td style={{ padding: '14px 18px', color: '#10b981', fontWeight: 800, fontSize: '14px', whiteSpace: 'nowrap' }}>
                          ₹{item.amountINR || item.amount || 0}
                        </td>

                        {/* Payment ID with copy button */}
                        <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            onClick={() => handleCopyId(item.paymentId)}
                            title="Click to copy Transaction ID"
                            style={{
                              background: 'rgba(0, 0, 0, 0.3)',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                              borderRadius: '6px',
                              padding: '4px 8px',
                              color: '#94a3b8',
                              fontSize: '11px',
                              fontFamily: 'monospace',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                          >
                            <span>{item.paymentId ? `${item.paymentId.slice(0, 14)}…` : '—'}</span>
                            {isCopied ? <FaCheck size={10} style={{ color: '#10b981' }} /> : <FaCopy size={10} />}
                          </button>
                        </td>

                        {/* Status */}
                        <td style={{ padding: '14px 18px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 8px',
                              borderRadius: '999px',
                              fontSize: '11px',
                              fontWeight: 700,
                              background: 'rgba(16, 185, 129, 0.15)',
                              color: '#10b981',
                            }}
                          >
                            <FaCheckCircle size={10} /> Success
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
