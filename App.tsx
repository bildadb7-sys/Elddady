
import React from 'react';
import { Refine, AuthProvider, Authenticated } from '@refinedev/core';
import { dataProvider } from '@refinedev/supabase';
import routerBindings, { 
    NavigateToResource
} from '@refinedev/react-router';
import { Routes, Route, Outlet } from 'react-router-dom';

import { supabase } from './supabaseClient';
import LandingPage from './components/LandingPage';

// --- ADMIN AUTH PROVIDER ---
const authProvider: AuthProvider = {
    login: async ({ email, password }) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return { success: false, error };

        const { data: profile } = await supabase
            .from('profiles')
            .select('is_admin')
            .eq('id', data.user.id)
            .single();

        if (!profile?.is_admin) {
            await supabase.auth.signOut();
            return { success: false, error: { message: "Access Denied: Not an Admin", name: "AuthError" }};
        }

        return { success: true, redirectTo: "/admin/users" };
    },
    logout: async () => {
        await supabase.auth.signOut();
        return { success: true, redirectTo: "/" };
    },
    check: async () => {
        const { data } = await supabase.auth.getSession();
        if (data.session) return { authenticated: true };
        return { authenticated: false, redirectTo: "/login" };
    },
    getPermissions: async () => null,
    getIdentity: async () => {
        const { data } = await supabase.auth.getUser();
        return data.user ? { ...data.user, name: data.user.email } : null;
    },
    onError: async (error) => {
        console.error(error);
        return { error };
    },
};

const AdminLayout = () => (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100 font-sans">
        <aside className="w-64 border-r border-zinc-800 p-6 flex flex-col gap-8">
            <h1 className="font-logo text-[#E86C44] text-4xl">Eldady Admin</h1>
            <nav className="flex flex-col gap-2">
                <a href="/admin/users" className="px-4 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 transition-colors font-bold">Users</a>
                <a href="/admin/transactions" className="px-4 py-2 rounded-lg hover:bg-zinc-800 transition-colors opacity-60">Transactions</a>
                <a href="/admin/withdrawals" className="px-4 py-2 rounded-lg hover:bg-zinc-800 transition-colors opacity-60">Withdrawals</a>
                <button onClick={() => window.location.href = '/'} className="mt-10 px-4 py-2 text-xs text-zinc-500 hover:text-white flex items-center gap-2">
                    <i className="fas fa-arrow-left"></i> Exit to App
                </button>
            </nav>
        </aside>
        <main className="flex-1 p-10 overflow-y-auto">
            <Outlet />
        </main>
    </div>
);

export const AdminApp: React.FC = () => {
    return (
        <Refine
            dataProvider={dataProvider(supabase)}
            authProvider={authProvider}
            routerProvider={routerBindings}
            resources={[
                {
                    name: "profiles",
                    list: "/admin/users",
                    meta: { label: "Users" }
                },
                {
                    name: "transactions",
                    list: "/admin/transactions",
                },
                {
                    name: "withdrawals",
                    list: "/admin/withdrawals",
                }
            ]}
            options={{ syncWithLocation: true, warnWhenUnsavedChanges: true }}
        >
            <Routes>
                <Route element={<Authenticated key="admin-routes" fallback={<LandingPage onLogin={async () => {}} onSignUp={() => {}} />}> <AdminLayout /> </Authenticated>}>
                     
                    <Route path="/admin/transactions" element={<div className="p-10 text-center opacity-50">Transaction Ledger Loading...</div>} />
                    <Route path="/admin/withdrawals" element={<div className="p-10 text-center opacity-50">Withdrawal Requests Loading...</div>} />
                </Route>

                <Route path="/login" element={<LandingPage onLogin={async () => {}} onSignUp={() => {}} />} />
            </Routes>
        </Refine>
    );
};

export default AdminApp;