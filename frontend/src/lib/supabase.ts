import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-project.supabase.co";
const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || "placeholder-anon-key";

const realSupabase = createClient(supabaseUrl, supabaseAnonKey);

const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

let mockUser: any = {
    id: "demo-user-id",
    email: "demo@lexos.org",
    new_email: null,
};

const mockAuth = {
    getSession: async () => {
        return {
            data: {
                session: {
                    access_token: "demo-access-token",
                    user: mockUser,
                },
            },
            error: null,
        };
    },
    onAuthStateChange: (callback: (event: any, session: any) => any) => {
        // Trigger callback with session immediately
        setTimeout(() => {
            callback("SIGNED_IN", {
                access_token: "demo-access-token",
                user: mockUser,
            });
        }, 0);
        return {
            data: {
                subscription: {
                    unsubscribe: () => {},
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
        return {
            data: {
                user: mockUser,
                session: { access_token: "demo-access-token", user: mockUser },
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
        return {
            data: {
                user: mockUser,
                session: { access_token: "demo-access-token", user: mockUser },
            },
            error: null,
        };
    },
    signOut: async () => {
        return { error: null };
    },
    updateUser: async (attributes: any) => {
        if (attributes.email) {
            mockUser = {
                ...mockUser,
                new_email: attributes.email,
            };
        }
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

