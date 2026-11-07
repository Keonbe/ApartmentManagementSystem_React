import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/axiosConfig';
import { Bone, SkeletonGroup } from '../Components/tenant/Skeleton';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const [state, setState] = useState({ loading: true, success: false, message: 'Verifying your email…' });
  useEffect(() => {
    let active = true;
    api.post('/verify_email.php', { token: params.get('token') || '' })
      .then(({ data }) => { if (active) setState({ loading: false, success: !!data.success, message: data.message }); })
      .catch(() => { if (active) setState({ loading: false, success: false, message: 'Unable to verify this link. It may be invalid or already used.' }); });
    return () => { active = false; };
  }, [params]);
  return <div className="min-h-screen flex items-center justify-center bg-slate-50 p-5"><section className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg"><div className="text-2xl font-bold text-indigo-700 mb-4">AMS</div><h1 className="text-xl font-bold text-slate-900 mb-3">Email verification</h1>{state.loading ? <SkeletonGroup label={state.message} className="space-y-3"><Bone className="mx-auto h-4 w-56" /><Bone className="mx-auto h-11 w-36 rounded-xl" /></SkeletonGroup> : <p role="status" className={state.success ? 'text-emerald-700' : 'text-slate-600'}>{state.message}</p>}{!state.loading && <Link to="/login" className="inline-block mt-6 rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white no-underline">Go to sign in</Link>}</section></div>;
}