
import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { PostReport, DetailedDispute } from '../types';

const AdminDashboard: React.FC = () => {
  const [data, setData] = useState<{ reports: PostReport[], disputes: DetailedDispute[] }>({ reports: [], disputes: [] });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'reports' | 'disputes'>('reports');
  const [adminBalance, setAdminBalance] = useState(0);

  useEffect(() => {
    const fetchAdminData = async () => {
      try {
        const [res, me] = await Promise.all([api.getAdminData(), api.getMe()]);
        setData(res);
        setAdminBalance(me.walletBalance || 0);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchAdminData();
  }, []);

  if (loading) return <div className="p-20 text-center animate-pulse">Loading Admin Control Panel...</div>;

  return (
    <div className="flex-1 min-h-screen bg-zinc-50 pb-20">
      <div className="bg-zinc-900 text-white p-6 shadow-lg">
         <div className="max-w-6xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-[#E86C44] rounded-lg flex items-center justify-center font-black text-xl">E</div>
               <div>
                  <h1 className="text-xl font-black tracking-tight">ELDADY ADMIN</h1>
                  <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest">Platform Safety & Disputes</p>
               </div>
            </div>
            <div className="flex items-center gap-6">
                <div className="text-right">
                    <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest">Ad Revenue</p>
                    <p className="text-xl font-black text-[#E86C44]">KES {adminBalance.toLocaleString()}</p>
                </div>
                <button onClick={() => window.location.hash = ''} className="text-xs font-bold hover:underline opacity-80">EXIT ADMIN SIDE</button>
            </div>
         </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        <div className="flex gap-4 mb-8">
           <button 
             onClick={() => setActiveTab('reports')}
             className={`flex-1 py-4 px-6 rounded-2xl font-black text-sm tracking-widest transition-all shadow-sm flex items-center justify-center gap-3 ${activeTab === 'reports' ? 'bg-[#E86C44] text-white' : 'bg-white text-zinc-500 hover:bg-zinc-100'}`}
           >
             <i className="fas fa-flag"></i>
             REPORTS ({data.reports.length})
           </button>
           <button 
             onClick={() => setActiveTab('disputes')}
             className={`flex-1 py-4 px-6 rounded-2xl font-black text-sm tracking-widest transition-all shadow-sm flex items-center justify-center gap-3 ${activeTab === 'disputes' ? 'bg-[#E86C44] text-white' : 'bg-white text-zinc-500 hover:bg-zinc-100'}`}
           >
             <i className="fas fa-gavel"></i>
             DISPUTES ({data.disputes.length})
           </button>
        </div>

        {activeTab === 'reports' && (
          <div className="space-y-4">
             {data.reports.length === 0 ? <p className="text-center py-20 text-zinc-400 font-bold">ALL CLEAR! NO REPORTS PENDING.</p> : 
             data.reports.map(rep => (
               <div key={rep.id} className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm hover:border-[#E86C44]/30 transition-all">
                  <div className="flex justify-between items-start mb-4">
                     <div className="flex items-center gap-3">
                        <div className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-[10px] font-black uppercase">Post Flagged</div>
                        <span className="text-xs text-zinc-400 font-medium">{new Date(rep.timestamp).toLocaleString()}</span>
                     </div>
                     <button className="text-xs font-bold text-[#E86C44] hover:underline">TAKE ACTION</button>
                  </div>
                  <div className="grid md:grid-cols-2 gap-6">
                     <div className="space-y-2">
                        <label className="text-[10px] font-black text-zinc-400 uppercase">Reason for Flag</label>
                        <p className="text-zinc-900 font-bold bg-zinc-50 p-4 rounded-xl border border-zinc-100">{rep.reason}</p>
                     </div>
                     <div className="space-y-2">
                        <label className="text-[10px] font-black text-zinc-400 uppercase">Original Content</label>
                        <div className="text-zinc-500 text-sm leading-relaxed italic border-l-4 border-zinc-200 pl-4 py-1">
                           "{rep.postContent || 'Content no longer available'}"
                        </div>
                     </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                     <span className="text-[10px] font-bold text-zinc-400">Reporter ID: {rep.reporterId}</span>
                     <span className="text-[10px] font-bold text-zinc-400">·</span>
                     <span className="text-[10px] font-bold text-zinc-400">Post ID: {rep.postId}</span>
                  </div>
               </div>
             ))}
          </div>
        )}

        {activeTab === 'disputes' && (
          <div className="space-y-4">
            {data.disputes.length === 0 ? <p className="text-center py-20 text-zinc-400 font-bold">EXCELLENT! NO ACTIVE DISPUTES.</p> : 
            data.disputes.map(disp => (
               <div key={disp.id} className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
                  <div className="bg-zinc-50 border-b border-zinc-100 p-4 flex justify-between items-center">
                     <div className="flex items-center gap-4">
                        <div className="bg-zinc-800 text-white px-3 py-1 rounded text-[10px] font-black uppercase">DISPUTE #{disp.id.slice(-4)}</div>
                        <span className="text-xs font-bold text-zinc-400">ORDER: {disp.orderId}</span>
                     </div>
                     <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${disp.status === 'Pending' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>
                        {disp.status}
                     </div>
                  </div>
                  <div className="p-6 space-y-6">
                     <div className="space-y-2">
                        <label className="text-[10px] font-black text-zinc-400 uppercase">Buyer Claims & Evidence</label>
                        <p className="text-zinc-900 font-medium leading-relaxed bg-zinc-50 p-4 rounded-xl border border-zinc-100">
                           {disp.claims}
                        </p>
                     </div>
                     {disp.evidencePhotos.length > 0 && (
                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-zinc-400 uppercase">Attached Photos ({disp.evidencePhotos.length})</label>
                          <div className="flex flex-wrap gap-3">
                             {disp.evidencePhotos.map((p, i) => (
                               <img key={i} src={p} className="w-24 h-24 rounded-lg object-cover border border-zinc-200 hover:scale-110 transition-transform cursor-zoom-in" />
                             ))}
                          </div>
                       </div>
                     )}
                     <div className="flex gap-3 pt-4">
                        <button className="flex-1 py-3 bg-green-600 text-white rounded-xl font-black text-xs tracking-widest hover:bg-green-700 shadow-md">REFUND BUYER</button>
                        <button className="flex-1 py-3 bg-zinc-800 text-white rounded-xl font-black text-xs tracking-widest hover:bg-zinc-900 shadow-md">RELEASE TO SELLER</button>
                        <button className="flex-1 py-3 border border-zinc-200 rounded-xl font-black text-xs tracking-widest hover:bg-zinc-50">NEED MORE INFO</button>
                     </div>
                  </div>
               </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
