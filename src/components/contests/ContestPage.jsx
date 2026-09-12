import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from '../router-compat';
import { getContestById } from '../../services/contestService';
import ContestLandingView from './ContestLandingView';
import SecurityWatermark from '../SecurityWatermark';
import { FaTrophy, FaArrowLeft, FaExclamationTriangle } from 'react-icons/fa';

export default function ContestPage() {
  const { contestId } = useParams();
  const navigate = useNavigate();

  const [contest, setContest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const user = React.useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('auth_data') || '{}');
    } catch (_) {
      return {};
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      if (!contestId) {
        if (isMounted) {
          setError('No contest ID specified.');
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const data = await getContestById(contestId);
        if (isMounted) {
          if (data) {
            setContest(data);
          } else {
            setError('Contest not found or has been archived.');
          }
        }
      } catch (err) {
        if (isMounted) {
          setError('Failed to load contest: ' + (err.message || 'Network error'));
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => { isMounted = false; };
  }, [contestId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-400 font-medium">Loading SEED Competitive Arena...</p>
      </div>
    );
  }

  if (error || !contest) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
        <FaExclamationTriangle className="text-5xl text-amber-500 mb-4" />
        <h2 className="text-2xl font-bold mb-2">Contest Unavailable</h2>
        <p className="text-slate-400 max-w-md mb-6">{error || 'This contest could not be found.'}</p>
        <button
          className="px-6 py-2.5 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 flex items-center gap-2"
          onClick={() => navigate('/student/dashboard')}
        >
          <FaArrowLeft /> Return to Student Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      <SecurityWatermark user={user} />
      <div className="max-w-7xl mx-auto">
        <ContestLandingView
          contest={contest}
          user={user}
          onBack={() => navigate('/student/dashboard')}
          onLaunchAssessment={(targetUrl) => navigate(targetUrl)}
        />
      </div>
    </div>
  );
}
