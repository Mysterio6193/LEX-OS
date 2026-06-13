import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-project.supabase.co";
const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || "placeholder-anon-key";

const realSupabase = createClient(supabaseUrl, supabaseAnonKey);

const getSupabaseUrl = () => {
    try {
        return process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-project.supabase.co";
    } catch {
        return "https://placeholder-project.supabase.co";
    }
};

const isDemoMode =
    process.env.NEXT_PUBLIC_DEMO_MODE === "true" ||
    getSupabaseUrl().includes("placeholder") ||
    getSupabaseUrl().includes("your-project") ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL;

let mockUser: any = {
    id: "demo-user-id",
    email: "demo@lexos.org",
    new_email: null,
};

const authListeners: ((event: any, session: any) => any)[] = [];

const triggerAuthChange = (event: string, session: any) => {
    authListeners.forEach((cb) => cb(event, session));
};

const mockAuth = {
    getSession: async () => {
        return {
            data: {
                session: mockUser ? {
                    access_token: "demo-access-token",
                    user: mockUser,
                } : null,
            },
            error: null,
        };
    },
    onAuthStateChange: (callback: (event: any, session: any) => any) => {
        authListeners.push(callback);
        // Trigger callback with session immediately
        setTimeout(() => {
            callback("SIGNED_IN", mockUser ? {
                access_token: "demo-access-token",
                user: mockUser,
            } : null);
        }, 0);
        return {
            data: {
                subscription: {
                    unsubscribe: () => {
                        const index = authListeners.indexOf(callback);
                        if (index !== -1) authListeners.splice(index, 1);
                    },
                },
            },
        };
    },
    signInWithPassword: async ({ email }: any) => {
        mockUser = {
            id: "demo-user-id",
            email: email || "demo@lexos.org",
            new_email: null,
        };
        const session = { access_token: "demo-access-token", user: mockUser };
        triggerAuthChange("SIGNED_IN", session);
        return {
            data: {
                user: mockUser,
                session,
            },
            error: null,
        };
    },
    signUp: async ({ email }: any) => {
        mockUser = {
            id: "demo-user-id",
            email: email || "demo@lexos.org",
            new_email: null,
        };
        const session = { access_token: "demo-access-token", user: mockUser };
        triggerAuthChange("SIGNED_IN", session);
        return {
            data: {
                user: mockUser,
                session,
            },
            error: null,
        };
    },
    signOut: async () => {
        mockUser = null;
        triggerAuthChange("SIGNED_OUT", null);
        return { error: null };
    },
    updateUser: async (attributes: any) => {
        if (attributes.email) {
            mockUser = {
                ...mockUser,
                new_email: attributes.email,
            };
        }
        const session = { access_token: "demo-access-token", user: mockUser };
        triggerAuthChange("USER_UPDATED", session);
        return {
            data: { user: mockUser },
            error: null,
        };
    },
    mfa: {
        listFactors: async () => {
            return { data: { all: [], totp: [] }, error: null };
        },
        challengeAndVerify: async () => {
            return { data: {}, error: null };
        },
    },
};

const mockSupabase = {
    auth: mockAuth,
};

export const supabase = isDemoMode ? (mockSupabase as any) : realSupabase;

