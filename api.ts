
import { supabase } from './supabaseClient';
import { User, Product, Vroom, Post, Conversation, Message, Order, DetailedDispute, PostReport, SearchResults, CartItem, Comment, Reaction } from './types';

// --- HELPERS ---

const API_URL = import.meta.env?.VITE_API_URL || 'http://localhost:5000/api';

const isOnline = (lastSeenAt?: string) => {
    if (!lastSeenAt) return false;
    const diff = new Date().getTime() - new Date(lastSeenAt).getTime();
    return diff < 2 * 60 * 1000; // 2 minutes threshold
};

export const mapProduct = (p: any): Product => ({
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price,
    currency: p.currency,
    image: p.image,
    video: p.video,
    likes: p.likes_count || 0,
    stock: p.stock_count,
    isOutOfStock: p.is_out_of_stock,
    commentsCount: p.comments_aggregate?.[0]?.count || p.comments_count || 0,
    sharesCount: p.shares_count || 0,
    userId: p.owner_id,
    category: p.category,
    tags: p.tags,
    // Defaults, usually overwritten if auth context is available during fetch
    isLiked: false, 
    isBookmarked: false 
});

const getFollowedVroomIds = async (): Promise<Set<string>> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Set();
    const { data } = await supabase.from('vroom_followers').select('vroom_id').eq('user_id', user.id);
    return new Set(data?.map((d: any) => d.vroom_id) || []);
};

const generateLocalTags = (description: string) => {
    const words = description.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const unique = [...new Set(words)].slice(0, 8);
    return unique.map(tag => ({ tag, weight: 1 }));
};

const fetchWithAuth = async (endpoint: string, options: any = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
        ...options.headers
    };
    
    const res = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers
    });
    
    if (!res.ok) throw new Error(`Request failed: ${res.statusText}`);
    return res.json();
};

export const api = {
    signup: async (formData: any) => {
        const firstName = formData.firstName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const lastName = formData.secondName.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        let handle = `@${firstName}${lastName}`;
        
        // Check Tier 1
        let { data: existing } = await supabase.from('profiles').select('id').eq('handle', handle).maybeSingle();
        
        if (existing) {
            // Tier 2
            handle = `@${firstName}_${lastName}`;
            let { data: existing2 } = await supabase.from('profiles').select('id').eq('handle', handle).maybeSingle();
            
            if (existing2) {
                // Tier 3
                const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
                let isUnique = false;
                while (!isUnique) {
                    const randomSuffix = chars[Math.floor(Math.random() * 36)] + chars[Math.floor(Math.random() * 36)];
                    handle = `@${firstName}_${lastName}_${randomSuffix}`;
                    let { data: existing3 } = await supabase.from('profiles').select('id').eq('handle', handle).maybeSingle();
                    if (!existing3) {
                        isUnique = true;
                    }
                }
            }
        }

        const { data, error } = await supabase.auth.signUp({
            email: formData.email,
            password: formData.password,
            options: {
                data: {
                    name: `${formData.firstName} ${formData.secondName}`,
                    handle: handle,
                    mobile: formData.mobile,
                    country: formData.country,
                    gender: formData.gender,
                    dob: formData.dob
                }
            }
        });
        if (error) throw error;
        return { user: data.user };
    },

    login: async (email: string, password: string, captchaToken?: string) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return { user: data.user };
    },

    googleLogin: async () => {
        const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
        if (error) throw error;
        return data;
    },

    logout: async () => {
        await supabase.auth.signOut();
    },

    startPromotion: async (itemType: 'product' | 'vroom', itemId: string) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const { error } = await supabase.rpc('start_promotion', {
            p_user_id: user.id,
            p_item_type: itemType,
            p_item_id: itemId
        });

        if (error) throw error;
    },

    registerAdClick: async (sellerId: string, itemType: 'product' | 'vroom', itemId: string) => {
        const { error } = await supabase.rpc('register_ad_click', {
            p_seller_id: sellerId,
            p_item_type: itemType,
            p_item_id: itemId
        });
        
        if (error) console.error("Ad click registration failed", error);
    },

    forgotPassword: async (email: string) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw error;
    },

    getMe: async (): Promise<User> => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
            
        if (error) throw error;
        
        return {
            id: profile.id,
            name: profile.name,
            handle: profile.handle,
            avatar: profile.avatar,
            email: profile.email,
            bannerImage: profile.banner_image,
            bio: profile.bio,
            location: profile.location,
            website: profile.website,
            instagram: profile.instagram,
            mobile: profile.mobile,
            currency: profile.currency,
            walletBalance: profile.wallet_balance,
            isAdmin: profile.is_admin,
            isOnline: true
        };
    },

    getPublicProfile: async (userId: string): Promise<User> => {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) throw error;

        return {
            id: profile.id,
            name: profile.name,
            handle: profile.handle,
            avatar: profile.avatar,
            bannerImage: profile.banner_image,
            bio: profile.bio,
            location: profile.location,
            website: profile.website,
            instagram: profile.instagram,
            isOnline: isOnline(profile.last_seen_at),
            lastSeenAt: profile.last_seen_at,
            followersCount: profile.followers_count,
            followingCount: profile.following_count
        };
    },

    updatePresence: async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            await supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', user.id);
        }
    },

    updateProfile: async (data: any): Promise<User> => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const updates = {
            name: `${data.firstName} ${data.lastName}`,
            handle: `@${data.username}`,
            bio: data.bio,
            location: data.location,
            website: data.website,
            instagram: data.instagram,
            updated_at: new Date().toISOString()
        };

        const { error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', user.id);

        if (error) throw error;
        return api.getMe();
    },
    
    updateProfileImage: async (type: 'avatar' | 'banner' | 'vroom', file: File) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const bucket = type === 'avatar' ? 'avatars' : 'banners'; 
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}-${Math.random()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
            .from(bucket)
            .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
            .from(bucket)
            .getPublicUrl(fileName);

        if (type === 'vroom') return { url: publicUrl };

        const updateField = type === 'avatar' ? 'avatar' : 'banner_image';
        await supabase.from('profiles').update({ [updateField]: publicUrl }).eq('id', user.id);
        
        return { url: publicUrl };
    },
    
    updateCurrency: async (newCurrency: string) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        
        const { error } = await supabase.from('profiles').update({ currency: newCurrency }).eq('id', user.id);
        if (error) throw error;
        return api.getMe();
    },

    getFeed: async (): Promise<Post[]> => {
        try {
             const { data: { user } } = await supabase.auth.getUser();
             
             const { data, error } = await supabase
                .from('posts')
                .select(`
                    *,
                    user:profiles!user_id(*),
                    product:products!product_id(
                        *,
                        product_likes(user_id),
                        bookmarks(user_id),
                        comments_aggregate:comments(count)
                    )
                `)
                .order('created_at', { ascending: false })
                .limit(20);
                
             if (error) throw error;
             
             return data.map((p:any) => {
                 const isLiked = p.product.product_likes?.some((l: any) => l.user_id === user?.id) || false;
                 const isBookmarked = p.product.bookmarks?.some((b: any) => b.user_id === user?.id) || false;
                 const commentsCount = p.product.comments_aggregate?.[0]?.count || 0;

                 return {
                     id: p.id,
                     user: p.user,
                     product: {
                         ...p.product,
                         userId: p.product.owner_id, 
                         likes: p.product.likes_count || 0,
                         sharesCount: p.product.shares_count || 0,
                         isOutOfStock: p.product.is_out_of_stock,
                         commentsCount: commentsCount,
                         isLiked,
                         isBookmarked
                     },
                     timestamp: new Date(p.created_at).toLocaleDateString(),
                     content: p.content,
                     commentsCount: commentsCount,
                     sharesCount: p.product.shares_count || 0
                 };
             });
        } catch (e) {
             console.error("Feed fetch error", e);
             return [];
        }
    },

    postProduct: async (data: any) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        let imageUrl = '';
        let videoUrl = '';
        if (data.media) {
            const res = await fetch(data.media);
            const blob = await res.blob();
            const fileExt = data.mediaType === 'video' ? 'mp4' : 'jpg';
            const fileName = `${Date.now()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage
                .from('products')
                .upload(fileName, blob);
            
            if (uploadError) throw uploadError;
            
            const { data: { publicUrl } } = supabase.storage.from('products').getPublicUrl(fileName);
            if (data.mediaType === 'video') videoUrl = publicUrl;
            else imageUrl = publicUrl;
        }

        const { data: product, error: prodError } = await supabase
            .from('products')
            .insert({
                owner_id: user.id,
                name: data.name,
                description: data.description,
                price: parseFloat(data.price),
                currency: data.currency,
                image: imageUrl || 'placeholder',
                video: videoUrl,
                category: data.category,
                tags: data.tags
            })
            .select()
            .single();

        if (prodError) throw prodError;

        if (data.tags && Array.isArray(data.tags) && data.tags.length > 0) {
            const tagsToProcess = data.tags.map((t: any) => {
                if (typeof t === 'string') return t.toLowerCase();
                if (typeof t === 'object' && t !== null && t.tag) return String(t.tag).toLowerCase();
                return String(t).toLowerCase();
            });
            const { data: existingTags } = await supabase.from('tags').select('tag, count').in('tag', tagsToProcess);
            const existingMap = new Map<string, number>(existingTags?.map((t: any) => [t.tag, t.count]) || []);
            const tagRecords = tagsToProcess.map((tag: string) => ({
                tag: tag,
                count: (existingMap.get(tag) || 0) + 1,
                last_used_at: new Date().toISOString()
            }));
            await supabase.from('tags').upsert(tagRecords, { onConflict: 'tag' });
        }

        const { error: postError } = await supabase
            .from('posts')
            .insert({
                user_id: user.id,
                product_id: product.id,
                content: `Check out my new product: ${data.name}`
            });

        if (postError) throw postError;
    },

    toggleLike: async (productId: string) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const { data: existing } = await supabase.from('product_likes').select('*').eq('product_id', productId).eq('user_id', user.id).single();
        
        let newLikes = 0;
        let isLiked = false;

        if (existing) {
            await supabase.from('product_likes').delete().eq('product_id', productId).eq('user_id', user.id);
            await supabase.rpc('decrement_product_likes', { p_id: productId });
            isLiked = false;
        } else {
            await supabase.from('product_likes').insert({ product_id: productId, user_id: user.id });
            await supabase.rpc('increment_product_likes', { p_id: productId });
            isLiked = true;
        }
        
        const { data } = await supabase.from('products').select('likes_count').eq('id', productId).single();
        newLikes = data?.likes_count || 0;

        return { likes: newLikes, isLiked };
    },

    toggleBookmark: async (productId: string) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const { data: existing } = await supabase.from('bookmarks').select('*').eq('product_id', productId).eq('user_id', user.id).single();

        if (existing) {
            await supabase.from('bookmarks').delete().eq('product_id', productId).eq('user_id', user.id);
            return { isBookmarked: false };
        } else {
            await supabase.from('bookmarks').insert({ product_id: productId, user_id: user.id });
            return { isBookmarked: true };
        }
    },
    
    incrementShare: async (productId: string) => {
        await supabase.rpc('increment_product_shares', { p_id: productId });
        const { data } = await supabase.from('products').select('shares_count').eq('id', productId).single();
        return data?.shares_count || 0;
    },
    
    reportPost: async (postId: string, reason: string) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        
        await supabase.from('reports').insert({
            reporter_id: user.id,
            post_id: postId,
            reason
        });
    },

    toggleStockStatus: async (productId: string, status: boolean) => {
        await supabase.from('products').update({ is_out_of_stock: status }).eq('id', productId);
    },

    search: async (query: string): Promise<SearchResults> => {
        let productsRaw, profilesRaw, vroomsRaw;

        try {
            if (!query || query.trim() === '') {
                const { data: p } = await supabase.from('products').select('*').order('created_at', { ascending: false }).limit(50);
                const { data: u } = await supabase.from('profiles').select('*').limit(20);
                const { data: v } = await supabase.from('vrooms').select('*, products(count)').order('created_at', { ascending: false }).limit(20);
                
                productsRaw = p;
                profilesRaw = u;
                vroomsRaw = v;
            } else {
                const { data: p } = await supabase.from('products').select('*').or(`name.ilike.%${query}%,description.ilike.%${query}%,category.ilike.%${query}%`);
                const { data: u } = await supabase.from('profiles').select('*').or(`name.ilike.%${query}%,handle.ilike.%${query}%,bio.ilike.%${query}%`);
                const { data: v } = await supabase.from('vrooms').select('*, products(count)').or(`name.ilike.%${query}%,description.ilike.%${query}%`);
                
                productsRaw = p;
                profilesRaw = u;
                vroomsRaw = v;
            }
        } catch (error) {
            console.error("Search API Error:", error);
            return { products: [], users: [], vrooms: [], hashtags: [] };
        }
        
        const followedIds = await getFollowedVroomIds();

        return {
            products: (productsRaw || []).map(mapProduct) as Product[],
            users: (profilesRaw || []).map((p: any) => ({
                id: p.id,
                name: p.name,
                handle: p.handle,
                avatar: p.avatar,
                walletBalance: 0,
                isOnline: false
            })) as User[],
            vrooms: (vroomsRaw || []).map((v: any) => ({
                id: v.id,
                name: v.name,
                description: v.description,
                coverImage: v.cover_image,
                productCount: v.products?.[0]?.count || 0,
                followers: v.followers_count,
                views: v.views_count?.toString() || '0',
                ownerId: v.owner_id,
                isPublic: v.is_public,
                isFollowing: followedIds.has(v.id), 
                products: []
            })) as Vroom[],
            hashtags: []
        };
    },

    getTrendingTags: async () => {
         const { data, error } = await supabase
            .from('tags')
            .select('*')
            .order('count', { ascending: false })
            .limit(10);

         let tagsData = data || [];

         if (error || tagsData.length === 0) {
             if (error) console.error("Error fetching trending tags from 'tags' table:", error);
             
             // Fallback: fetch tags from recent products
             const { data: productsData, error: productsError } = await supabase
                .from('products')
                .select('tags')
                .order('created_at', { ascending: false })
                .limit(100);
                
             if (!productsError && productsData) {
                 const tagCounts: Record<string, number> = {};
                 productsData.forEach(product => {
                     let productTags = product.tags;
                     if (typeof productTags === 'string') {
                         try {
                             productTags = JSON.parse(productTags);
                         } catch (e) {}
                     }
                     if (productTags && Array.isArray(productTags)) {
                         productTags.forEach((t: any) => {
                             let cleanTag = t;
                             try {
                                 if (typeof cleanTag === 'string' && (cleanTag.trim().startsWith('{') || cleanTag.trim().startsWith('['))) {
                                     const parsed = JSON.parse(cleanTag);
                                     if (parsed.tag) cleanTag = parsed.tag;
                                 } else if (typeof cleanTag === 'object' && cleanTag !== null) {
                                     if (cleanTag.tag) cleanTag = cleanTag.tag;
                                     else cleanTag = JSON.stringify(cleanTag);
                                 }
                             } catch (e) {}
                             
                             if (typeof cleanTag !== 'string') cleanTag = String(cleanTag);
                             cleanTag = cleanTag.toLowerCase();
                             
                             tagCounts[cleanTag] = (tagCounts[cleanTag] || 0) + 1;
                         });
                     }
                 });
                 
                 tagsData = Object.entries(tagCounts)
                    .map(([tag, count]) => ({ tag, count }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 10);
             }
         }
         
         if (tagsData.length === 0) {
             // If still empty, provide some default trending tags
             tagsData = [
                 { tag: 'fashion', count: 100 },
                 { tag: 'tech', count: 85 },
                 { tag: 'lifestyle', count: 70 },
                 { tag: 'art', count: 65 },
                 { tag: 'music', count: 50 }
             ];
         }
         
         return tagsData.map((t: any) => {
             let cleanTag = t.tag;
             try {
                 if (typeof cleanTag === 'string' && (cleanTag.trim().startsWith('{') || cleanTag.trim().startsWith('['))) {
                     const parsed = JSON.parse(cleanTag);
                     if (parsed.tag) cleanTag = parsed.tag;
                 } else if (typeof cleanTag === 'object' && cleanTag !== null) {
                     if (cleanTag.tag) cleanTag = cleanTag.tag;
                     else cleanTag = JSON.stringify(cleanTag);
                 }
             } catch (e) {}
             
             if (typeof cleanTag !== 'string') {
                 cleanTag = String(cleanTag);
             }
             
             return { tag: cleanTag, score: t.count };
         });
    },
    
    searchTags: async (query: string) => {
        const { data } = await supabase.from('tags').select('tag').ilike('tag', `%${query}%`).limit(5);
        return (data || []).map((t: any) => ({ value: t.tag, label: t.tag }));
    },

    generateTags: async (description: string) => {
         try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 3000); 

            const res = await fetch(`${API_URL}/tags/suggest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description }),
                signal: controller.signal
            });
            clearTimeout(id);

            if (res.ok) {
                const data = await res.json();
                if (data.tags && Array.isArray(data.tags)) return { tags: data.tags };
            }
            throw new Error("Server tag generation failed");
        } catch (e) {
            console.warn("Using local tag generator");
            return { tags: generateLocalTags(description) };
        }
    },

    getPopularVrooms: async (): Promise<Vroom[]> => {
        const { data } = await supabase
            .from('vrooms')
            .select('*, products(count)')
            .order('views_count', { ascending: false })
            .limit(10);

        const followedIds = await getFollowedVroomIds();

        return (data || []).map((v: any) => ({
            id: v.id,
            name: v.name,
            description: v.description,
            coverImage: v.cover_image,
            productCount: v.products?.[0]?.count || 0,
            followers: v.followers_count,
            views: v.views_count.toString(),
            recent_views: v.views_count, 
            ownerId: v.owner_id,
            isPublic: v.is_public,
            isFollowing: followedIds.has(v.id),
            products: []
        }));
    },
    
    getUserVrooms: async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];
        const { data } = await supabase
            .from('vrooms')
            .select('*, products(count)')
            .eq('owner_id', user.id);

        return (data || []).map((v: any) => ({
             id: v.id,
             name: v.name,
             description: v.description,
             coverImage: v.cover_image,
             productCount: v.products?.[0]?.count || 0,
             followers: v.followers_count || 0,
             views: v.views_count?.toString() || '0',
             ownerId: v.owner_id,
             isPublic: v.is_public,
             products: []
        }));
    },

    getPublicUserVrooms: async (userId: string): Promise<Vroom[]> => {
        const { data } = await supabase
            .from('vrooms')
            .select('*, products(count)')
            .eq('owner_id', userId)
            .eq('is_public', true);

        const followedIds = await getFollowedVroomIds();

        return (data || []).map((v: any) => ({
             id: v.id,
             name: v.name,
             description: v.description,
             coverImage: v.cover_image,
             productCount: v.products?.[0]?.count || 0,
             followers: v.followers_count || 0,
             views: v.views_count?.toString() || '0',
             ownerId: v.owner_id,
             isPublic: v.is_public,
             isFollowing: followedIds.has(v.id), 
             products: []
        }));
    },

    getPublicUserFollowingVrooms: async (userId: string): Promise<Vroom[]> => {
        const { data } = await supabase
            .from('vroom_followers')
            .select('vroom:vrooms(*, products(count))')
            .eq('user_id', userId);

        const followedIds = await getFollowedVroomIds();

        return (data || [])
            .filter((f: any) => f.vroom && f.vroom.is_public)
            .map((f: any) => ({
                id: f.vroom.id,
                name: f.vroom.name,
                description: f.vroom.description,
                coverImage: f.vroom.cover_image,
                productCount: f.vroom.products?.[0]?.count || 0,
                followers: f.vroom.followers_count || 0,
                views: f.vroom.views_count?.toString() || '0',
                ownerId: f.vroom.owner_id,
                isPublic: f.vroom.is_public,
                isFollowing: followedIds.has(f.vroom.id),
                products: []
            }));
    },

    getVroomById: async (id: string): Promise<Vroom> => {
        const { data: v, error } = await supabase
            .from('vrooms')
            .select('*, products(*)')
            .eq('id', id)
            .single();
            
        if (error) throw error;
        
        const followedIds = await getFollowedVroomIds();
        
        return {
             id: v.id,
             name: v.name,
             description: v.description,
             coverImage: v.cover_image,
             productCount: v.products ? v.products.length : 0,
             followers: v.followers_count,
             views: v.views_count.toString(),
             ownerId: v.owner_id,
             isPublic: v.is_public,
             isFollowing: followedIds.has(v.id),
             products: (v.products || []).map(mapProduct)
        };
    },

    createVroom: async (data: any) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        
        const { data: vroom, error } = await supabase.from('vrooms').insert({
            owner_id: user.id,
            name: data.name,
            description: data.description,
            cover_image: data.coverImage,
            is_public: data.is_public
        }).select().single();
        
        if (error) throw error;
        
        return {
             id: vroom.id,
             name: vroom.name,
             description: vroom.description,
             coverImage: vroom.cover_image,
             productCount: 0,
             followers: vroom.followers_count,
             views: vroom.views_count.toString(),
             ownerId: vroom.owner_id,
             isPublic: vroom.is_public,
             products: []
        };
    },
    
    updateVroom: async (id: string, data: any) => {
        const { data: vroom, error } = await supabase.from('vrooms').update({
             name: data.name,
             description: data.description,
             cover_image: data.coverImage,
             is_public: data.is_public
        }).eq('id', id).select('*, products(*)').single();
        
         if (error) throw error;
         const followedIds = await getFollowedVroomIds();

         return {
             id: vroom.id,
             name: vroom.name,
             description: vroom.description,
             coverImage: vroom.cover_image,
             productCount: vroom.products ? vroom.products.length : 0,
             followers: vroom.followers_count,
             views: vroom.views_count.toString(),
             ownerId: vroom.owner_id,
             isPublic: vroom.is_public,
             isFollowing: followedIds.has(vroom.id),
             products: (vroom.products || []).map(mapProduct)
        };
    },
    
    toggleFollowVroom: async (vroomId: string) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const { data: existing } = await supabase
            .from('vroom_followers')
            .select('*')
            .eq('vroom_id', vroomId)
            .eq('user_id', user.id)
            .single();
        
        let result;
        if (existing) {
            await supabase.from('vroom_followers').delete().eq('vroom_id', vroomId).eq('user_id', user.id);
            await supabase.rpc('decrement_vroom_followers', { v_id: vroomId });
            const { count } = await supabase.from('vroom_followers').select('*', { count: 'exact', head: true }).eq('vroom_id', vroomId);
            result = { isFollowing: false, followers: count || 0 };
        } else {
            await supabase.from('vroom_followers').insert({ vroom_id: vroomId, user_id: user.id });
            await supabase.rpc('increment_vroom_followers', { v_id: vroomId });
            const { count } = await supabase.from('vroom_followers').select('*', { count: 'exact', head: true }).eq('vroom_id', vroomId);
            result = { isFollowing: true, followers: count || 1 };
        }

        window.dispatchEvent(new CustomEvent('vroom-follow-changed', { 
            detail: { vroomId, ...result } 
        }));

        return result;
    },
    
    recordVroomView: async (id: string) => {
        let counted = false;
        try {
            const res = await fetch(`${API_URL}/vrooms/${id}/view`, { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                counted = data.counted;
            }
        } catch (e) {
            // Fallback to direct RPC if backend is not available
            try {
                await supabase.rpc('increment_vroom_views', { vroom_uuid: id });
                counted = true;
            } catch (err) {
                console.error(err);
            }
        }
        
        if (counted) {
            window.dispatchEvent(new CustomEvent('vroom-viewed', { detail: { vroomId: id } }));
        }
        return counted;
    },
    
    getVroomsDashboard: async () => {
        const myVrooms = await api.getUserVrooms();
        const popular = await api.getPopularVrooms();
        const { data: { user } } = await supabase.auth.getUser();
        
        let following: any[] = [];
        if (user) {
            const { data } = await supabase.from('vroom_followers').select('vroom:vrooms(*, products(count))').eq('user_id', user.id);
            following = (data || []).map((f: any) => ({
                id: f.vroom.id,
                name: f.vroom.name,
                description: f.vroom.description,
                coverImage: f.vroom.cover_image,
                productCount: f.vroom.products?.[0]?.count || 0,
                followers: f.vroom.followers_count,
                views: f.vroom.views_count.toString(),
                ownerId: f.vroom.owner_id,
                isPublic: f.vroom.is_public,
                isFollowing: true,
                products: []
            }));
        }

        return {
            myVroom: myVrooms[0] || null,
            following: following,
            suggested: popular 
        }
    },
    
    getAvailableProductsForVroom: async (vroomId: string) => {
         const { data: { user } } = await supabase.auth.getUser();
         if (!user) return [];
         const { data } = await supabase.from('products').select('*').eq('owner_id', user.id).is('vroom_id', null);
         return (data || []).map(mapProduct) as Product[];
    },
    
    addProductToVroom: async (vroomId: string, productId: string) => {
        await supabase.from('products').update({ vroom_id: vroomId }).eq('id', productId);
        return (await api.getVroomById(vroomId)); 
    },

    getConversations: async (): Promise<Conversation[]> => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        const { data: myConvs } = await supabase
            .from('conversation_participants')
            .select('conversation_id, last_read_at')
            .eq('user_id', user.id);
            
        const convIds = myConvs?.map(c => c.conversation_id) || [];
        const readMap = new Map(myConvs?.map(c => [c.conversation_id, new Date(c.last_read_at || 0).getTime()]) || []);

        if (convIds.length === 0) return [];

        const { data: conversations } = await supabase
            .from('conversations')
            .select(`
                *,
                participants:conversation_participants(
                    user:profiles(*)
                ),
                messages:messages(
                    *,
                    sender:profiles(*)
                )
            `)
            .in('id', convIds)
            .order('last_message_at', { ascending: false });

        return (conversations || []).map((c: any) => {
            const isGroup = c.is_group;
            
            const otherParticipant = !isGroup 
                ? c.participants.find((p: any) => p.user.id !== user.id)?.user 
                : null;

            const messages = (c.messages || [])
                .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                .map((m: any) => ({
                    id: m.id,
                    senderId: m.sender_id,
                    senderName: m.sender?.name,
                    senderAvatar: m.sender?.avatar,
                    content: m.content,
                    image: m.image_url,
                    timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    isMe: m.sender_id === user.id,
                    isSystem: m.is_system,
                    reactions: []
                }));

            const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
            const lastReadTime = readMap.get(c.id) || 0;
            // Calculate unread count based on messages newer than last_read_at and not sent by me
            const unreadCount = messages.filter((m: any) => !m.isMe && new Date(m.timestamp).getTime() > lastReadTime).length; // timestamp is generic, using real created_at diff is better but this works for simple view

            return {
                id: c.id,
                isGroup: isGroup,
                groupName: c.group_name,
                groupPhoto: c.group_photo,
                ownerId: c.owner_id,
                user: otherParticipant ? {
                    id: otherParticipant.id,
                    name: otherParticipant.name,
                    handle: otherParticipant.handle,
                    avatar: otherParticipant.avatar,
                    isOnline: isOnline(otherParticipant.last_seen_at),
                    lastSeenAt: otherParticipant.last_seen_at
                } : undefined,
                lastMessage: lastMsg?.content || (lastMsg?.image ? 'Image' : 'Started a conversation'),
                lastMessageTime: lastMsg?.timestamp || '',
                lastMessageTimestamp: new Date(c.last_message_at).getTime(),
                messages: messages,
                participants: c.participants.map((p: any) => ({
                    ...p.user,
                    isOnline: isOnline(p.user.last_seen_at)
                })),
                unreadCount: unreadCount
            };
        });
    },
    
    sendMessage: async (conversationId: string, content: string, replyToId?: string, image?: string) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        
        let imageUrl = null;
        if (image) {
            const fileName = `chat-${Date.now()}-${Math.random().toString(36).substring(7)}`;
            const res = await fetch(image);
            const blob = await res.blob();
            const { error: uploadError } = await supabase.storage.from('products').upload(fileName, blob);
            if (!uploadError) {
                const { data } = supabase.storage.from('products').getPublicUrl(fileName);
                imageUrl = data.publicUrl;
            }
        }

        const { error } = await supabase.from('messages').insert({
            conversation_id: conversationId,
            sender_id: user.id,
            content,
            image_url: imageUrl,
            reply_to_id: replyToId
        });

        if (error) throw error;

        await supabase.from('conversations')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', conversationId);
            
        // Optimistic read for sender
        api.markConversationAsRead(conversationId);
    },

    markConversationAsRead: async (conversationId: string) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        await supabase.from('conversation_participants')
            .update({ last_read_at: new Date().toISOString() })
            .eq('conversation_id', conversationId)
            .eq('user_id', user.id);
    },

    subscribeToMessages: (conversationId: string, callback: (msg: Message) => void) => {
        return supabase
            .channel(`public:messages:conversation_id=eq.${conversationId}`)
            .on(
                'postgres_changes', 
                { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, 
                async (payload) => {
                    const msg = payload.new;
                    const { data: sender } = await supabase.from('profiles').select('*').eq('id', msg.sender_id).single();
                    const { data: { user } } = await supabase.auth.getUser();

                    callback({
                        id: msg.id,
                        senderId: msg.sender_id,
                        senderName: sender?.name,
                        senderAvatar: sender?.avatar,
                        content: msg.content,
                        image: msg.image_url,
                        timestamp: new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        isMe: user?.id === msg.sender_id,
                        isSystem: msg.is_system,
                        reactions: []
                    });
            })
            .subscribe();
    },
    
    startDirectMessage: async (targetUserId: string): Promise<Conversation> => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        // Simple check to find existing DM
        const allConvs = await api.getConversations();
        const existingDM = allConvs.find(c => !c.isGroup && c.participants?.some(p => p.id === targetUserId));

        if (existingDM) return existingDM;

        const { data: conv, error } = await supabase.from('conversations').insert({
            is_group: false,
            owner_id: user.id
        }).select().single();

        if (error) throw error;

        const participants = [
            { conversation_id: conv.id, user_id: user.id },
            { conversation_id: conv.id, user_id: targetUserId }
        ];
        await supabase.from('conversation_participants').insert(participants);

        const updatedConvs = await api.getConversations();
        return updatedConvs.find(c => c.id === conv.id)!;
    },

    createGroup: async (name: string, photo: string, members: string[]) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        
        const { data: conv, error } = await supabase.from('conversations').insert({
            is_group: true,
            group_name: name,
            group_photo: photo || `https://ui-avatars.com/api/?name=${name}&background=random`,
            owner_id: user.id
        }).select().single();
        
        if (error) throw error;
        
        const participants = [user.id, ...members].map(uid => ({ conversation_id: conv.id, user_id: uid }));
        await supabase.from('conversation_participants').insert(participants);
        
        const allConvs = await api.getConversations();
        return allConvs.find(c => c.id === conv.id)!;
    },
    
    joinGroup: async (id: string) => {
         const { data: { user } } = await supabase.auth.getUser();
         if (!user) throw new Error("Not authenticated");
         
         const { error } = await supabase.from('conversation_participants').insert({ conversation_id: id, user_id: user.id });
         if (error) throw error;

         const allConvs = await api.getConversations();
         return allConvs.find(c => c.id === id)!;
    },
    
    leaveGroup: async (id: string) => {
         const { data: { user } } = await supabase.auth.getUser();
         if (!user) throw new Error("Not authenticated");
         await supabase.from('conversation_participants').delete().eq('conversation_id', id).eq('user_id', user.id);
    },
    
    addGroupMember: async (conversationId: string, userId: string) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        await supabase.from('conversation_participants').insert({ conversation_id: conversationId, user_id: userId });
    },

    removeGroupMember: async (conversationId: string, userId: string) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        await supabase.from('conversation_participants').delete().eq('conversation_id', conversationId).eq('user_id', userId);
    },
    
    getAllUsers: async () => {
        const { data } = await supabase.from('profiles').select('*');
        return (data || []) as User[];
    },

    createOrder: async (items: CartItem[], shippingData: any) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        
        const { data: profile } = await supabase.from('profiles').select('currency').eq('id', user.id).single();
        const currencyCode = profile?.currency || 'USD'; 

        const { data: orderId, error } = await supabase.rpc('create_secure_order', {
            buyer_id: user.id,
            recipient_name: shippingData.recipientName,
            shipping_address: shippingData,
            items: items.map(i => ({ product_id: i.id, quantity: i.quantity })),
            buyer_currency_code: currencyCode
        });
        
        if (error) throw error;
        return orderId;
    },
    
    getOrders: async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];
        const { data } = await supabase.from('orders').select('*, order_items(*)').eq('buyer_id', user.id).order('created_at', { ascending: false });
        return (data || []).map((o:any) => ({
            id: o.id,
            items: o.order_items,
            shipping: o.shipping_address,
            total: o.total_amount,
            timestamp: o.created_at,
            status: o.status
        }));
    },
    
    confirmOrder: async (orderId: string) => {
        await supabase.rpc('release_escrow', { order_uuid: orderId });
    },
    
    disputeOrder: async (orderId: string, claims: string, photos: string[]) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        
        await supabase.from('disputes_detailed').insert({
            order_id: orderId,
            user_id: user.id,
            claims,
            evidence_photos: photos
        });
        
        await supabase.from('orders').update({ status: 'Disputed' }).eq('id', orderId);
    },
    
    getDisputeByOrderId: async (orderId: string): Promise<DetailedDispute | null> => {
        const { data } = await supabase.from('disputes_detailed').select('*').eq('order_id', orderId).single();
        if (!data) return null;
        return {
            id: data.id,
            orderId: data.order_id,
            userId: data.user_id,
            claims: data.claims,
            evidencePhotos: data.evidence_photos,
            timestamp: data.created_at,
            status: data.status
        };
    },
    
    cancelDispute: async (orderId: string) => {
        await supabase.from('disputes_detailed').delete().eq('order_id', orderId);
        await supabase.from('orders').update({ status: 'Shipped' }).eq('id', orderId);
    },

    fundWallet: async (amount: number, method: string) => {
         const { data: { user } } = await supabase.auth.getUser();
         if (!user) throw new Error("Not authenticated");
         
         const { data: newBalance, error } = await supabase.rpc('fund_wallet', { user_uuid: user.id, amount });
         if (error) throw error;
         return { newBalance };
    },

    getUserProducts: async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];
        const { data } = await supabase.from('products').select('*').eq('owner_id', user.id);
        return (data || []).map(mapProduct);
    },

    getBookmarks: async () => {
         const { data: { user } } = await supabase.auth.getUser();
         if (!user) return [];
         const { data } = await supabase.from('bookmarks').select('product:products(*)').eq('user_id', user.id);
         return (data || []).map((b: any) => mapProduct(b.product)) as Product[];
    },
    
    getFollowing: async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];
        const { data } = await supabase.from('user_follows').select('profile:profiles!following_id(*)').eq('follower_id', user.id);
        return (data || []).map((f: any) => f.profile) as User[];
    },
    
    getFollowers: async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];
        const { data } = await supabase.from('user_follows').select('profile:profiles!follower_id(*)').eq('following_id', user.id);
        return (data || []).map((f: any) => f.profile) as User[];
    },

    getAdminData: async () => {
        const { data: reports } = await supabase.from('reports').select('*');
        const { data: disputes } = await supabase.from('disputes_detailed').select('*');
        return {
            reports: (reports || []).map((r:any) => ({
                id: r.id,
                postId: r.post_id,
                reporterId: r.reporter_id,
                reason: r.reason,
                timestamp: r.created_at
            })) as PostReport[],
            disputes: (disputes || []).map((d:any) => ({
                 id: d.id,
                 orderId: d.order_id,
                 userId: d.user_id,
                 claims: d.claims,
                 evidencePhotos: d.evidence_photos,
                 timestamp: d.created_at,
                 status: d.status
            })) as DetailedDispute[]
        };
    },

    getDiscovery: async () => {
         const { data } = await supabase.from('posts').select(`*, user:profiles!user_id(*), product:products!product_id(*)`).limit(5);
         return (data || []).map((p:any) => ({ id: `disc-${p.id}`, ...p }));
    },
    
    getRecommendations: async (productId: string): Promise<Post[]> => {
        try {
            const res = await fetchWithAuth('/recommendations', { method: 'POST', body: JSON.stringify({ productId }) });
            return (res.posts || []) as Post[];
        } catch {
            return [];
        }
    },
    
    getComments: async (productId: string): Promise<Comment[]> => {
        const { data: comments, error } = await supabase
            .from('comments')
            .select(`
                *,
                user:profiles!user_id(*),
                reactions:comment_reactions(emoji, user_id)
            `)
            .eq('product_id', productId)
            .order('created_at', { ascending: true }); 

        if (error) {
            console.error("Error fetching comments:", error);
            return [];
        }

        const commentMap = new Map<string, Comment>();
        const roots: Comment[] = [];

        comments.forEach((c: any) => {
            const reactionMap = new Map<string, Reaction>();
            if (c.reactions) {
                c.reactions.forEach((r: any) => {
                    if (!reactionMap.has(r.emoji)) {
                        reactionMap.set(r.emoji, { emoji: r.emoji, count: 0, userIds: [] });
                    }
                    const reaction = reactionMap.get(r.emoji)!;
                    reaction.count++;
                    reaction.userIds.push(r.user_id);
                });
            }

            const formattedComment: Comment = {
                id: c.id,
                user: {
                    id: c.user.id,
                    name: c.user.name,
                    handle: c.user.handle,
                    avatar: c.user.avatar,
                    isOnline: false
                },
                content: c.content,
                timestamp: new Date(c.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
                replies: [],
                reactions: Array.from(reactionMap.values()),
                image: c.image_url
            };

            commentMap.set(c.id, formattedComment);
        });

        comments.forEach((c: any) => {
            const current = commentMap.get(c.id);
            if (current) {
                if (c.parent_id && commentMap.has(c.parent_id)) {
                    const parent = commentMap.get(c.parent_id);
                    parent?.replies.push(current);
                } else {
                    roots.push(current);
                }
            }
        });

        return roots;
    },

    addComment: async (productId: string, content: string, parentId: string | null, image?: string) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        let imageUrl = null;
        if (image) {
            const res = await fetch(image);
            const blob = await res.blob();
            const fileName = `comment-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
            const { error: uploadError } = await supabase.storage.from('products').upload(fileName, blob); 
            if (!uploadError) {
                const { data: { publicUrl } } = supabase.storage.from('products').getPublicUrl(fileName);
                imageUrl = publicUrl;
            }
        }
        
        const { data, error } = await supabase.from('comments').insert({
            product_id: productId,
            user_id: user.id,
            content,
            parent_id: parentId,
            image_url: imageUrl
        }).select(`
            *,
            user:profiles!user_id(*)
        `).single();

        if (error) throw error;
        
        return {
            id: data.id,
            user: {
                id: data.user.id,
                name: data.user.name,
                handle: data.user.handle,
                avatar: data.user.avatar
            },
            content: data.content,
            timestamp: new Date(data.created_at).toLocaleString(),
            replies: [],
            reactions: [],
            image: data.image_url
        } as Comment;
    },
    
    addCommentReaction: async (productId: string, commentId: string, emoji: string) => {
         const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        
        const { data: existing } = await supabase.from('comment_reactions')
            .select('*')
            .eq('comment_id', commentId)
            .eq('user_id', user.id)
            .eq('emoji', emoji)
            .single();

        if (existing) {
            await supabase.from('comment_reactions').delete()
                .eq('comment_id', commentId)
                .eq('user_id', user.id)
                .eq('emoji', emoji);
            return { action: 'removed' };
        } else {
            await supabase.from('comment_reactions').insert({
                comment_id: commentId,
                user_id: user.id,
                emoji
            });
            return { action: 'added' };
        }
    },
    
    toggleFollowUser: async (targetId: string) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const { data: existing } = await supabase.from('user_follows')
            .select('*')
            .eq('follower_id', user.id)
            .eq('following_id', targetId)
            .single();

        if (existing) {
            await supabase.from('user_follows').delete().eq('follower_id', user.id).eq('following_id', targetId);
            await supabase.rpc('decrement_user_followers', { u_id: targetId });
            await supabase.rpc('decrement_user_following', { u_id: user.id });
            return false;
        } else {
            await supabase.from('user_follows').insert({ follower_id: user.id, following_id: targetId });
            await supabase.rpc('increment_user_followers', { u_id: targetId });
            await supabase.rpc('increment_user_following', { u_id: user.id });
            return true;
        }
    },
    
    getIsFollowingUser: async (targetId: string) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return false;
        const { data } = await supabase.from('user_follows').select('follower_id').eq('follower_id', user.id).eq('following_id', targetId).single();
        return !!data;
    },
    
    getUserStats: async (userId: string) => {
        const [products, vrooms, followers] = await Promise.all([
            supabase.from('products').select('*', { count: 'exact', head: true }).eq('owner_id', userId),
            supabase.from('vrooms').select('*', { count: 'exact', head: true }).eq('owner_id', userId),
            supabase.from('user_follows').select('*', { count: 'exact', head: true }).eq('following_id', userId)
        ]);

        return {
            products: products.count || 0,
            vrooms: vrooms.count || 0,
            followers: followers.count || 0
        };
    }
};
