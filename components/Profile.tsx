
import React, { useState, useEffect, useRef } from 'react';
import { User, Product, Order } from '../types';
import { CURRENT_USER } from '../constants';
import { api, mapProduct } from '../api';
import { supabase } from '../supabaseClient';
import { FileDisputeModal, ReviewDisputeModal } from './Modals';
import { applyWatermark } from '../utils/imageProcessor';
import { useCurrency } from '../context/useCurrency';
import PromoteModal from './PromoteModal';
import { useAppSettings } from '../hooks/useAppSettings';

interface ProfileProps {
  user: User;
  isOwner?: boolean; 
  onPostProduct: () => void;
  onProductClick: (product: Product) => void;
  onShare: (product: Product) => void;
  onUserUpdate?: (user: User) => void;
  onAddToCart: (product: Product) => void;
  onUserClick?: (userId: string) => void;
}

// --- Sub-Components ---

// ProductItem component for "My Products" page with the stock toggle switch.
const ProductItem: React.FC<{ 
  product: Product; 
  currentUser: User;
  onProductClick: (product: Product) => void;
  onShare: (product: Product) => void;
  onAddToCart: (product: Product) => void;
  onPromote: (product: Product) => void;
}> = ({ product, currentUser, onProductClick, onShare, onAddToCart, onPromote }) => {
  const [localProduct, setLocalProduct] = useState(product);
  const [isToggling, setIsToggling] = useState(false);
  const { convertPrice, formatPrice, userCurrency } = useCurrency();
  const { settings } = useAppSettings();

  useEffect(() => {
      setLocalProduct(product);
  }, [product]);

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { likes, isLiked } = await api.toggleLike(product.id);
      setLocalProduct(p => ({ ...p, likes, isLiked }));
    } catch (err) {
      console.error(err);
    }
  };

  const handleBookmark = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { isBookmarked } = await api.toggleBookmark(product.id);
      setLocalProduct(p => ({ ...p, isBookmarked }));
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleStock = async (e: React.MouseEvent) => {
      e.stopPropagation();
      const newStatus = !localProduct.isOutOfStock;
      // Optimistic update
      setLocalProduct(prev => ({ ...prev, isOutOfStock: newStatus }));
      setIsToggling(true);
      
      try {
          await api.toggleStockStatus(localProduct.id, newStatus);
      } catch (err) {
          console.error(err);
          // Revert on error
          setLocalProduct(prev => ({ ...prev, isOutOfStock: !newStatus }));
          alert("Failed to toggle stock status. Check connection.");
      } finally {
          setIsToggling(false);
      }
  };

  const isOwner = currentUser.id === localProduct.userId;
  
  // Convert price for display using user's preference
  const displayPrice = convertPrice(localProduct.price, localProduct.currency);
  const formattedPrice = formatPrice(displayPrice, userCurrency);

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden hover:shadow-lg transition-shadow group relative">
      <div 
        className="aspect-[4/3] bg-muted relative overflow-hidden cursor-pointer flex items-center justify-center bg-black"
        onClick={() => onProductClick(localProduct)}
      >
        {/* Visual State: Overlay if Out of Stock */}
        {localProduct.isOutOfStock && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10 pointer-events-none backdrop-blur-sm transition-all duration-300">
                <span className="border-4 border-white text-white font-black text-xl px-6 py-3 transform -rotate-12 uppercase tracking-widest opacity-90 shadow-2xl">
                    Out of Stock
                </span>
            </div>
        )}

        {/* Boost Button */}
        {isOwner && settings?.ads_enabled && (
             <button 
                 onClick={(e) => {
                     e.stopPropagation();
                     onPromote(localProduct);
                 }}
                 className="absolute top-2 right-2 bg-white/90 hover:bg-white text-orange-500 text-xs font-bold px-2 py-1 rounded-full shadow-sm z-20 flex items-center gap-1"
             >
                 <i className="fas fa-rocket"></i> Boost
             </button>
         )}

        {localProduct.video ? (
             <>
                 <video src={localProduct.video} className="w-full h-full object-cover opacity-80" muted playsInline />
                 <div className="absolute inset-0 flex items-center justify-center">
                     <div className="w-10 h-10 bg-black/50 rounded-full flex items-center justify-center backdrop-blur-sm">
                         <i className="fas fa-play text-white ml-1"></i>
                     </div>
                 </div>
             </>
        ) : (
            <img src={localProduct.image} alt={localProduct.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
        )}
      </div>
      
      <div className="p-4">
        {/* Info Area */}
        <div className="mb-3">
            <div className="flex justify-between items-start mb-1">
                <h4 className="font-bold text-sm truncate pr-2">{localProduct.name}</h4>
                <span className={`text-xs font-black whitespace-nowrap ${localProduct.isOutOfStock ? 'text-muted-foreground line-through decoration-1' : 'text-[#E86C44]'}`}>
                    {formattedPrice}
                </span>
            </div>
            <p className="text-[10px] text-muted-foreground line-clamp-2 h-8">{localProduct.description}</p>
        </div>

        {/* Action Row */}
        <div className="flex items-stretch gap-1.5 h-10">
          
          {/* Child Component My Product Card Logic: */}
          {/* If Owner: Show Prominent Toggle. HIDE Bookmark, Cart, Comment. */}
          {isOwner ? (
             <button 
                onClick={handleToggleStock}
                disabled={isToggling}
                className={`flex-[2] rounded-lg flex items-center justify-center gap-2 transition-all shadow-sm font-black text-[10px] uppercase tracking-widest ${
                    localProduct.isOutOfStock 
                    ? 'bg-green-600 text-white hover:bg-green-700 shadow-green-600/20' 
                    : 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                }`}
             >
                {isToggling ? (
                    <i className="fas fa-circle-notch fa-spin"></i>
                ) : localProduct.isOutOfStock ? (
                    <><i className="fas fa-box-open"></i> Restock Product</>
                ) : (
                    <><i className="fas fa-ban"></i> Mark Out of Stock</>
                )}
             </button>
          ) : (
            // Viewer Logic (Cart)
            <button 
              data-title={localProduct.isOutOfStock ? "Sold Out" : "Cart"}
              onClick={(e) => {
                e.stopPropagation();
                if (!localProduct.isOutOfStock) onAddToCart(product);
              }}
              disabled={localProduct.isOutOfStock}
              className={`custom-tooltip text-white px-3 rounded-lg flex items-center justify-center transition-colors shadow-sm ${
                  localProduct.isOutOfStock
                  ? 'bg-muted-foreground cursor-not-allowed opacity-50'
                  : 'bg-[#E86C44] hover:bg-[#d6623e]'
              }`}
            >
              {localProduct.isOutOfStock ? (
                  <span className="text-[9px] font-bold uppercase">Sold</span>
              ) : (
                  <i className="fas fa-shopping-cart text-sm"></i>
              )}
            </button>
          )}
          
          {/* Slot 2: Like (Always Visible) */}
          <button data-title="Like" onClick={handleLike} className="custom-tooltip flex-1 bg-white border border-border rounded-lg flex flex-col items-center justify-center hover:bg-muted/50">
            <i className={`${localProduct.isLiked ? 'fas' : 'far'} fa-heart text-[#E86C44] text-[10px] mb-0.5`}></i>
            <span className="text-[9px] font-medium text-foreground">{localProduct.likes}</span>
          </button>
          
          {/* Slot 3: Share (Always Visible) */}
          <button data-title="Share" onClick={() => onShare(localProduct)} className="custom-tooltip flex-1 bg-white border border-border rounded-lg flex flex-col items-center justify-center hover:bg-muted/50">
            <i className="fas fa-share text-foreground text-[10px] mb-0.5"></i>
            <span className="text-[9px] font-medium text-foreground">{localProduct.sharesCount || 0}</span>
          </button>

          {/* Slot 4 & 5: Comment & Bookmark (STRICTLY HIDDEN for Owner as per requirements) */}
          {!isOwner && (
            <>
                <button data-title="Comment" onClick={() => onProductClick(localProduct)} className="custom-tooltip flex-1 bg-white border border-border rounded-lg flex flex-col items-center justify-center hover:bg-muted/50">
                    <i className="far fa-comment text-foreground text-[10px] mb-0.5"></i>
                    <span className="text-[9px] font-medium text-foreground">{localProduct.commentsCount || 0}</span>
                </button>
                <button data-title="Bookmark" onClick={handleBookmark} className="custom-tooltip flex-1 bg-white border border-border rounded-lg flex items-center justify-center hover:bg-muted/50">
                    <i className={`${localProduct.isBookmarked ? 'fas' : 'far'} fa-bookmark text-[#E86C44] text-xs`}></i>
                </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const WalletTab: React.FC<{
    balance: number;
    orders: Order[];
    onFund: (amount: number, method: string, phone?: string) => Promise<void>;
    onConfirmOrder: (id: string) => void;
    onDisputeOrder: (id: string) => void;
    onReviewDispute: (id: string) => void;
}> = ({ balance, orders, onFund, onConfirmOrder, onDisputeOrder, onReviewDispute }) => {
    const { userCurrency, setUserCurrency, availableCurrencies, formatPrice } = useCurrency();
    const [showFundModal, setShowFundModal] = useState(false);
    const [fundAmount, setFundAmount] = useState('');
    const [fundMethod, setFundMethod] = useState<'mpesa' | 'card'>('mpesa');
    const [mpesaPhone, setMpesaPhone] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    const handleFundSubmit = async () => {
        const amount = parseFloat(fundAmount);
        if (isNaN(amount) || amount <= 0) return alert("Please enter a valid amount");
        
        if (fundMethod === 'mpesa' && (!mpesaPhone || mpesaPhone.length < 10)) {
            return alert("Please enter a valid M-Pesa phone number");
        }
        
        setIsProcessing(true);
        try {
            await onFund(amount, fundMethod === 'mpesa' ? 'M-Pesa' : 'Card', mpesaPhone);
            setShowFundModal(false);
            setFundAmount('');
            setMpesaPhone('');
        } catch (e) {
            alert("Funding failed. Please try again.");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
            {/* Wallet Card */}
            <div className="bg-gradient-to-br from-[#E86C44] to-[#c05634] rounded-2xl p-8 text-white shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10 transform translate-x-1/4 -translate-y-1/4">
                    <i className="fas fa-wallet text-9xl"></i>
                </div>
                
                <div className="relative z-10">
                    <div className="flex justify-between items-start mb-2">
                        <h2 className="text-sm font-bold uppercase tracking-wider opacity-90">Total Balance</h2>
                        
                        {/* Currency Picker from Context */}
                        <div className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-lg px-2 py-1 backdrop-blur-sm">
                           <i className="fas fa-globe-africa text-[10px] opacity-70"></i>
                           <select 
                                value={userCurrency} 
                                onChange={(e) => setUserCurrency(e.target.value)}
                                className="bg-transparent text-xs font-black focus:outline-none cursor-pointer uppercase tracking-tighter"
                            >
                                {availableCurrencies.map(c => <option key={c} value={c} className="text-foreground">{c}</option>)}
                            </select>
                        </div>
                    </div>
                    
                    <div className="text-5xl font-black mb-8 tracking-tighter flex items-baseline">
                        {/* Use formatted price but strip symbol for custom styling here */}
                        <span className="text-xl mr-2 font-bold opacity-60">{userCurrency}</span>
                        {balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    
                    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                        <button 
                            onClick={() => setShowFundModal(true)}
                            className="bg-white text-[#E86C44] px-8 py-3 rounded-xl font-black text-sm hover:bg-white/90 shadow-lg transition-all active:scale-95 flex items-center gap-3"
                        >
                            <i className="fas fa-plus-circle"></i>
                            ADD FUNDS
                        </button>
                        
                        <div className="flex items-center gap-2 text-[10px] font-black bg-black/20 px-3 py-1.5 rounded-full border border-white/10 uppercase tracking-widest">
                            <i className="fas fa-shield-alt text-green-400"></i> 
                            Secured Escrow
                        </div>
                    </div>
                </div>
            </div>

            {/* Redesigned Fund Modal */}
            {showFundModal && (
                <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-card w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-border">
                        <div className="p-6 border-b border-border flex justify-between items-center bg-muted/30">
                            <h3 className="font-black text-lg tracking-tight uppercase">Deposit Funds</h3>
                            <button onClick={() => setShowFundModal(false)} className="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center text-muted-foreground hover:text-foreground">
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-6">
                            {/* Amount Input */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Enter Amount ({userCurrency})</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-[#E86C44]">{userCurrency}</span>
                                    <input 
                                        type="number" 
                                        autoFocus
                                        value={fundAmount}
                                        onChange={(e) => setFundAmount(e.target.value)}
                                        placeholder="0.00" 
                                        className="w-full bg-background border-2 border-border focus:border-[#E86C44] rounded-2xl pl-14 pr-4 py-4 font-black text-2xl outline-none transition-all"
                                    />
                                </div>
                            </div>

                            {/* Payment Method Tabs */}
                            <div className="flex p-1.5 bg-muted rounded-2xl gap-1">
                                <button 
                                    onClick={() => setFundMethod('mpesa')}
                                    className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${fundMethod === 'mpesa' ? 'bg-white shadow-sm text-[#E86C44]' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                    <i className="fas fa-mobile-alt"></i> M-Pesa
                                </button>
                                <button 
                                    onClick={() => setFundMethod('card')}
                                    className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${fundMethod === 'card' ? 'bg-white shadow-sm text-[#E86C44]' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                    <i className="fas fa-credit-card"></i> Card
                                </button>
                            </div>

                            {/* Method Specific Fields */}
                            <div className="min-h-[120px]">
                                {fundMethod === 'mpesa' ? (
                                    <div className="space-y-4 animate-in slide-in-from-top-2">
                                        <div className="bg-green-50 border border-green-100 p-4 rounded-2xl flex items-center gap-4">
                                            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/M-PESA_LOGO-01.svg/1200px-M-PESA_LOGO-01.svg.png" className="h-6" alt="M-Pesa" />
                                            <div className="flex-1">
                                                <p className="text-[10px] text-green-800 font-black uppercase">Direct STK Push</p>
                                                <p className="text-[9px] text-green-700/70 font-bold">Safe & Instant deposit</p>
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-muted-foreground uppercase ml-1">Phone Number</label>
                                            <input 
                                                type="tel" 
                                                value={mpesaPhone}
                                                onChange={(e) => setMpesaPhone(e.target.value)}
                                                placeholder="254 7XX XXX XXX" 
                                                className="w-full px-5 py-4 bg-background border border-border rounded-2xl focus:ring-2 focus:ring-[#E86C44]/20 focus:border-[#E86C44] outline-none font-bold"
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4 animate-in slide-in-from-top-2">
                                        <div className="grid grid-cols-1 gap-3">
                                            <div className="relative">
                                                <i className="fas fa-credit-card absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground opacity-50"></i>
                                                <input placeholder="Card Number" className="w-full pl-12 pr-4 py-4 bg-background border border-border rounded-2xl outline-none focus:border-[#E86C44] font-bold" />
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <input placeholder="MM/YY" className="w-full px-4 py-4 bg-background border border-border rounded-2xl outline-none focus:border-[#E86C44] font-bold text-center" />
                                                <input placeholder="CVC" className="w-full px-4 py-4 bg-background border border-border rounded-2xl outline-none focus:border-[#E86C44] font-bold text-center" />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <button 
                                onClick={handleFundSubmit}
                                disabled={isProcessing || !fundAmount}
                                className="w-full py-5 bg-[#E86C44] text-white rounded-2xl font-black text-sm tracking-widest hover:brightness-110 shadow-xl shadow-[#E86C44]/30 flex items-center justify-center gap-3 transition-all active:scale-[0.98] disabled:opacity-50 disabled:grayscale disabled:pointer-events-none"
                            >
                                {isProcessing ? (
                                    <><i className="fas fa-circle-notch fa-spin"></i> INITIALIZING...</>
                                ) : (
                                    <><i className="fas fa-lock"></i> SECURE DEPOSIT</>
                                )}
                            </button>
                            
                            <p className="text-[10px] text-center text-muted-foreground font-bold px-4 leading-relaxed">
                                {fundMethod === 'mpesa' 
                                    ? "Wait for the M-Pesa PIN prompt on your phone after clicking." 
                                    : "Transactions are encrypted and secured by PCIDSS standards."}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Order History */}
            <div>
                <div className="flex items-center justify-between mb-6">
                    <h3 className="font-black text-xl tracking-tight flex items-center gap-2 text-foreground">
                        <i className="fas fa-box-open text-[#E86C44]"></i> RECENT ORDERS
                    </h3>
                    {orders.length > 0 && (
                        <span className="text-[10px] font-black text-muted-foreground bg-muted px-2.5 py-1 rounded-full">{orders.length} ITEMS</span>
                    )}
                </div>

                {orders.length > 0 ? (
                    <div className="space-y-4">
                        {orders.map(order => (
                            <div key={order.id} className="bg-card border border-border rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm hover:shadow-md transition-all">
                                <div>
                                    <div className="flex items-center gap-3 mb-2">
                                        <span className="font-mono font-bold text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded">#{order.id.slice(-6).toUpperCase()}</span>
                                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border uppercase tracking-widest flex items-center gap-1.5 ${
                                            order.status === 'Completed' ? 'bg-green-100 text-green-700 border-green-200' :
                                            order.status === 'Disputed' ? 'bg-red-100 text-red-700 border-red-200' :
                                            'bg-blue-100 text-blue-700 border-blue-200'
                                        }`}>
                                            <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                                                 order.status === 'Completed' ? 'bg-green-500' :
                                                 order.status === 'Disputed' ? 'bg-red-500' :
                                                 'bg-blue-500'
                                            }`}></span>
                                            {order.status}
                                        </span>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <p className="text-sm text-foreground font-bold">
                                            {order.items.length} item{order.items.length !== 1 ? 's' : ''} for <span className="text-[#E86C44] font-black">{formatPrice(order.total, userCurrency)}</span>
                                        </p>
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight opacity-60">
                                            {new Date(order.timestamp).toLocaleDateString(undefined, { dateStyle: 'long' })}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    {order.status === 'Processing' || order.status === 'Shipped' ? (
                                        <>
                                            <button 
                                                onClick={() => onConfirmOrder(order.id)}
                                                className="flex-1 md:flex-none px-5 py-2.5 bg-green-600 text-white text-[10px] font-black rounded-xl hover:bg-green-700 transition-colors shadow-sm flex items-center justify-center gap-2 active:scale-95 uppercase tracking-widest"
                                            >
                                                <i className="fas fa-check"></i> CONFIRM
                                            </button>
                                            <button 
                                                onClick={() => onDisputeOrder(order.id)}
                                                className="flex-1 md:flex-none px-5 py-2.5 border-2 border-destructive/20 text-destructive text-[10px] font-black rounded-xl hover:bg-destructive/10 transition-colors active:scale-95 uppercase tracking-widest"
                                            >
                                                DISPUTE
                                            </button>
                                        </>
                                    ) : order.status === 'Disputed' ? (
                                        <button 
                                          onClick={() => onReviewDispute(order.id)}
                                          className="flex-1 md:flex-none px-5 py-2.5 text-[10px] font-black rounded-xl flex items-center justify-center gap-2 border-2 bg-red-50 text-red-700 border-red-100 hover:bg-red-100 transition-all active:scale-95 animate-pulse uppercase tracking-widest"
                                        >
                                           <i className="fas fa-search"></i> REVIEW CLAIM
                                        </button>
                                    ) : (
                                        <div className={`flex-1 md:flex-none px-5 py-2.5 text-[10px] font-black rounded-xl flex items-center justify-center gap-2 border-2 uppercase tracking-widest ${
                                            order.status === 'Completed' 
                                            ? 'bg-green-50 text-green-700 border-green-100' 
                                            : 'bg-red-50 text-red-700 border-red-100'
                                        }`}>
                                            {order.status === 'Completed' ? (
                                                <><i className="fas fa-check-double"></i> DELIVERED</>
                                            ) : (
                                                <><i className="fas fa-undo"></i> REFUNDED</>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-20 bg-muted/20 rounded-3xl border-2 border-dashed border-border flex flex-col items-center justify-center">
                        <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-6">
                            <i className="fas fa-shopping-basket text-3xl text-muted-foreground opacity-30"></i>
                        </div>
                        <h4 className="text-lg font-black text-foreground uppercase tracking-tight">No Transactions Found</h4>
                        <p className="text-muted-foreground text-xs max-w-xs mt-2 font-medium opacity-70">
                            Your marketplace history and escrow balances will appear here once you start shopping.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- Main Component ---

const Profile: React.FC<ProfileProps> = ({ user, isOwner: propIsOwner = false, onPostProduct, onProductClick, onShare, onUserUpdate, onAddToCart, onUserClick }) => {
  const isOwner = propIsOwner || (user && (user.id === 'me' || user.id === CURRENT_USER.id));
  const [activeTab, setActiveTab] = useState(isOwner ? 'wallet' : 'products');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateVroomModalOpen, setIsCreateVroomModalOpen] = useState(false);
  const [activeDisputeOrderId, setActiveDisputeOrderId] = useState<string | null>(null);
  const [reviewDisputeOrderId, setReviewDisputeOrderId] = useState<string | null>(null);
  const [promoteItem, setPromoteItem] = useState<{ type: 'product' | 'vroom', id: string, name: string } | null>(null);

  // New State for Accurate Counts
  const [stats, setStats] = useState({ products: 0, vrooms: 0, followers: 0 });

  const [userProducts, setUserProducts] = useState<Product[]>([]);
  const [userBookmarks, setUserBookmarks] = useState<Product[]>([]);
  const [userVrooms, setUserVrooms] = useState<any[]>([]);
  const [walletBalance, setWalletBalance] = useState(user.walletBalance || 0);
  const [orders, setOrders] = useState<Order[]>([]);
  const [userFollowing, setUserFollowing] = useState<User[]>([]);
  const [userFollowers, setUserFollowers] = useState<User[]>([]);
  
  const [isFollowing, setIsFollowing] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [followerCount, setFollowerCount] = useState(0); // Synced with DB stats

  const [createVroomData, setCreateVroomData] = useState({ name: '', description: '', coverImage: '', isPublic: true });
  
  // SAFE INITIALIZATION
  // We use fallback empty strings to prevent undefined crashes if user object is malformed
  const [profileData, setProfileData] = useState({
    firstName: user?.name ? user.name.split(' ')[0] : '',
    lastName: user?.name ? (user.name.split(' ')[1] || '') : '',
    username: user?.handle ? user.handle.replace('@', '') : '',
    bio: user.bio || 'Digital creator and product enthusiast.',
    location: user.location || 'Nairobi, Kenya',
    website: user.website || '',
    instagram: user.instagram || '',
    bannerImage: user.bannerImage || '',
    avatar: user.avatar || '',
    currency: user.currency || 'USD'
  });
  
  const [formData, setFormData] = useState(profileData);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const bannerInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const vroomImageInputRef = useRef<HTMLInputElement>(null);

  // Fetch Accurate Stats
  useEffect(() => {
      const loadStats = async () => {
          const targetId = isOwner ? (await api.getMe()).id : user.id;
          if(targetId) {
              const counts = await api.getUserStats(targetId);
              setStats(counts);
              setFollowerCount(counts.followers); // Sync follower toggle display
          }
      };
      loadStats();
  }, [user.id, isOwner]);

  // Realtime Subscription for My Products
  // Subscribes to changes in the 'products' table for the current user to ensure instant stock updates reflect.
  useEffect(() => {
      if (activeTab === 'products' && user.id) {
          const channel = supabase.channel('my-products-changes')
              .on(
                  'postgres_changes',
                  {
                      event: '*',
                      schema: 'public',
                      table: 'products',
                      filter: `owner_id=eq.${user.id}`
                  },
                  (payload) => {
                      // Optimistically update list based on event type
                      if (payload.eventType === 'INSERT') {
                          // Note: Raw payload lacks joined data like likes, but sufficient for stock/listing updates
                          setUserProducts(prev => [mapProduct(payload.new), ...prev]);
                      } else if (payload.eventType === 'UPDATE') {
                          setUserProducts(prev => prev.map(p => p.id === payload.new.id ? { ...p, ...mapProduct(payload.new) } : p));
                      } else if (payload.eventType === 'DELETE') {
                          setUserProducts(prev => prev.filter(p => p.id !== payload.old.id));
                      }
                  }
              )
              .subscribe();

          return () => {
              supabase.removeChannel(channel);
          };
      }
  }, [activeTab, user.id]);

  // Realtime Subscription for My Vrooms
  useEffect(() => {
      if (activeTab === 'vrooms' && user.id) {
          const handleFollowChange = (e: CustomEvent) => {
              const { vroomId, followers } = e.detail;
              setUserVrooms(prev => prev.map(v => v.id === vroomId ? { ...v, followers } : v));
          };

          const handleViewed = (e: CustomEvent) => {
              const { vroomId } = e.detail;
              setUserVrooms(prev => prev.map(v => v.id === vroomId ? { ...v, views: (parseInt(v.views || '0') + 1).toString() } : v));
          };

          window.addEventListener('vroom-follow-changed' as any, handleFollowChange);
          window.addEventListener('vroom-viewed' as any, handleViewed);

          const channel = supabase.channel('my-vrooms-changes')
              .on(
                  'postgres_changes',
                  {
                      event: 'UPDATE',
                      schema: 'public',
                      table: 'vrooms',
                      filter: `owner_id=eq.${user.id}`
                  },
                  (payload) => {
                      const updatedVroom = payload.new as any;
                      setUserVrooms(prev => prev.map(v => {
                          if (v.id === updatedVroom.id) {
                              return {
                                  ...v,
                                  followers: updatedVroom.followers_count,
                                  views: updatedVroom.views_count?.toString() || v.views
                              };
                          }
                          return v;
                      }));
                  }
              )
              .subscribe();

          return () => {
              window.removeEventListener('vroom-follow-changed' as any, handleFollowChange);
              window.removeEventListener('vroom-viewed' as any, handleViewed);
              supabase.removeChannel(channel);
          };
      }
  }, [activeTab, user.id]);

  const fetchWalletData = async () => {
      try {
        const me = await api.getMe();
        setWalletBalance(me.walletBalance || 0);
        const myOrders = await api.getOrders();
        setOrders(myOrders);
      } catch (e) {
        console.error("Failed to load wallet data", e);
      }
  };

  useEffect(() => {
    const fetchData = async () => {
        try {
            if (activeTab === 'products') {
                const prods = await api.getUserProducts();
                setUserProducts(prods);
            } else if (activeTab === 'bookmarks') {
                const bookmarks = await api.getBookmarks();
                setUserBookmarks(bookmarks);
            } else if (activeTab === 'vrooms') {
                const vrooms = await api.getUserVrooms();
                setUserVrooms(vrooms);
            } else if (activeTab === 'wallet' && isOwner) {
                await fetchWalletData();
            } else if (activeTab === 'following') {
                const following = await api.getFollowing();
                setUserFollowing(following);
            } else if (activeTab === 'followers') {
                const followers = await api.getFollowers();
                setUserFollowers(followers);
            }
        } catch (e) {
            console.error("Failed to load profile tab data", e);
        }
    };
    fetchData();
  }, [activeTab, user.id, isOwner]);

  useEffect(() => {
      if (!user) return;
      setProfileData({
          firstName: user.name ? user.name.split(' ')[0] : '',
          lastName: user.name ? (user.name.split(' ')[1] || '') : '',
          username: user.handle ? user.handle.replace('@', '') : '',
          bio: user.bio || '',
          location: user.location || '',
          website: user.website || '',
          instagram: user.instagram || '',
          bannerImage: user.bannerImage || '',
          avatar: user.avatar,
          currency: user.currency || 'USD'
      });
      if (isOwner && user.walletBalance !== undefined) {
          setWalletBalance(user.walletBalance);
      }
  }, [user, isOwner]);

  const handleFundWallet = async (amount: number, method: string, phone?: string) => {
      try {
          const { newBalance } = await api.fundWallet(amount, method);
          setWalletBalance(newBalance);
          alert(`Funds added successfully via ${method}!`);
      } catch (e: any) {
          alert(e.message || "Failed to fund wallet");
      }
  };

  const handleConfirmOrder = async (orderId: string) => {
      try {
          await api.confirmOrder(orderId);
          setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'Completed' } : o));
          alert("Delivery confirmed. Funds released to seller.");
      } catch (e) {
          alert("Failed to confirm order");
      }
  };

  const handleDisputeOrder = (orderId: string) => { setActiveDisputeOrderId(orderId); };
  const handleReviewDispute = (orderId: string) => { setReviewDisputeOrderId(orderId); }
  const onDisputeSubmitted = async () => { await fetchWalletData(); };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
        const updatedUser = await api.updateProfile(formData);
        setProfileData(prev => ({
            ...prev,
            firstName: updatedUser.name.split(' ')[0],
            lastName: updatedUser.name.split(' ')[1],
            username: updatedUser.handle.replace('@', ''),
            bio: updatedUser.bio || formData.bio,
            location: formData.location,
            website: formData.website,
            instagram: formData.instagram,
            currency: formData.currency
        }));
        if (onUserUpdate) onUserUpdate(updatedUser);
        setIsEditModalOpen(false);
    } catch (err: any) {
        alert(err.message || "Failed to update profile");
    } finally {
        setSaving(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'avatar' | 'banner' | 'vroom') => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) return alert("File size exceeds 5MB limit.");
      setUploading(true);
      try {
        const watermarkedBlob = await applyWatermark(file);
        const watermarkedFile = new File([watermarkedBlob], file.name, { type: 'image/jpeg' });
        if (type === 'avatar' || type === 'banner') {
            const response: any = await api.updateProfileImage(type, watermarkedFile);
            setProfileData(prev => ({ ...prev, [type === 'avatar' ? 'avatar' : 'bannerImage']: response.url }));
            setFormData(prev => ({ ...prev, [type === 'avatar' ? 'avatar' : 'bannerImage']: response.url }));
            if (onUserUpdate) {
                const me = await api.getMe();
                onUserUpdate(me);
            }
        } else if (type === 'vroom') {
            const response: any = await api.updateProfileImage('vroom', watermarkedFile);
            setCreateVroomData(prev => ({ ...prev, coverImage: response.url }));
        }
      } catch (error) {
        console.error(error);
        alert("Failed to upload/watermark image.");
      } finally {
        setUploading(false);
        e.target.value = '';
      }
    }
  };

  const handleCreateVroom = async (e: React.FormEvent) => {
      e.preventDefault();
      setSaving(true);
      try {
          const newVroom = await api.createVroom(createVroomData);
          setUserVrooms(prev => [...prev, newVroom]);
          
          // Optimistically update counts
          setStats(prev => ({ ...prev, vrooms: prev.vrooms + 1 }));
          
          setIsCreateVroomModalOpen(false);
          setCreateVroomData({ name: '', description: '', coverImage: '', isPublic: true });
      } catch (e) {
          alert("Failed to create vroom");
      } finally {
          setSaving(false);
      }
  };

  return (
    <div className="flex-1 min-h-screen bg-background pb-20 md:pb-10">
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        
        {/* Profile Header */}
        <div className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden mb-8">
            <div className="h-48 relative overflow-hidden bg-gradient-to-r from-blue-400/20 to-purple-500/20 group">
                {profileData.bannerImage ? (
                  <img src={profileData.bannerImage} alt="Banner" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center opacity-10">
                     <i className="fas fa-image text-9xl"></i>
                  </div>
                )}
            </div>
            <div className="px-8 pb-8">
                <div className="flex justify-between items-start -mt-20 mb-6">
                    <div className="relative group mt-20 md:mt-0">
                        <div className="w-40 h-40 rounded-full border-8 border-card bg-card overflow-hidden shadow-2xl relative bg-muted">
                            {profileData.avatar ? (
                                <img src={profileData.avatar} alt="Profile" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center"><i className="fas fa-user text-4xl text-muted-foreground"></i></div>
                            )}
                        </div>
                    </div>
                    
                    <div className="mt-24 flex items-center gap-3">
                        {isOwner ? (
                            <div className="flex gap-2">
                                <button data-title="Edit Details" onClick={() => { setFormData(profileData); setIsEditModalOpen(true); }} className="custom-tooltip px-6 py-2.5 border-2 border-border rounded-xl font-black text-xs uppercase tracking-widest hover:bg-muted transition-all flex items-center gap-2 shadow-sm">
                                    <i className="fas fa-edit"></i> Edit
                                </button>
                                {user.isAdmin && (
                                  <button onClick={() => window.location.hash = 'admin'} className="px-6 py-2.5 bg-zinc-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-zinc-700 transition-all flex items-center gap-2 shadow-lg">
                                     <i className="fas fa-shield-alt"></i> Admin
                                  </button>
                                )}
                            </div>
                        ) : (
                            <>
                                <button onClick={() => { setIsFollowing(!isFollowing); setFollowerCount(p => isFollowing ? p-1 : p+1); }} className={`px-8 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg ${isFollowing ? 'bg-background border-2 border-border text-foreground' : 'bg-[#E86C44] text-white'}`}>
                                    {isFollowing ? 'Following' : 'Follow'}
                                </button>
                                <button onClick={() => { setIsBlocked(!isBlocked); setIsFollowing(false); }} className={`w-10 h-10 flex items-center justify-center rounded-xl border-2 transition-all ${isBlocked ? 'bg-destructive text-white border-destructive' : 'bg-background hover:bg-muted border-border'}`}>
                                    <i className={`fas ${isBlocked ? 'fa-unlock' : 'fa-ban'}`}></i>
                                </button>
                            </>
                        )}
                    </div>
                </div>
                
                <div className="space-y-4">
                    <div>
                        <h1 className="text-4xl font-black text-foreground tracking-tighter uppercase">{profileData.firstName} {profileData.lastName}</h1>
                        <p className="text-[#E86C44] text-lg font-black tracking-tight">@{profileData.username}</p>
                    </div>
                    {profileData.bio && <p className="text-foreground/80 text-base font-medium leading-relaxed max-w-2xl">{profileData.bio}</p>}
                    <div className="flex flex-wrap gap-6 text-muted-foreground text-[10px] font-black uppercase tracking-widest">
                        {profileData.location && <span className="flex items-center gap-2"><i className="fas fa-map-marker-alt text-[#E86C44]"></i> {profileData.location}</span>}
                        {profileData.website && <a href={profileData.website} target="_blank" className="flex items-center gap-2 text-blue-500 hover:underline"><i className="fas fa-globe"></i> Website</a>}
                    </div>
                    
                    {/* Database Synced Stats */}
                    <div className="flex gap-10 pt-6 border-t border-border/50 mt-6">
                        <div className="text-center">
                            <div className="font-black text-2xl text-foreground">{stats.products.toLocaleString()}</div>
                            <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Products</div>
                        </div>
                        <div className="text-center">
                            <div className="font-black text-2xl text-foreground">{stats.vrooms.toLocaleString()}</div>
                            <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Vrooms</div>
                        </div>
                        <div className="text-center">
                            <div className="font-black text-2xl text-foreground">{followerCount.toLocaleString()}</div>
                            <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Followers</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* Improved Tabs */}
        <div className="flex border-b border-border mb-8 overflow-x-auto no-scrollbar scroll-smooth">
            {[
                { id: 'wallet', icon: 'fa-wallet', label: 'CASHY WALLET', hidden: !isOwner },
                { id: 'products', icon: 'fa-heart', label: 'MY PRODUCTS' },
                { id: 'vrooms', icon: 'fa-store', label: 'MY VROOMS' },
                { id: 'bookmarks', icon: 'fa-bookmark', label: 'SAVED' },
                { id: 'following', icon: 'fa-user-friends', label: 'FOLLOWING' },
                { id: 'followers', icon: 'fa-users', label: 'FOLLOWERS' },
            ].filter(t => !t.hidden).map(tab => (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-8 py-4 font-black text-[10px] uppercase tracking-widest whitespace-nowrap flex items-center gap-2 border-b-4 transition-all ${
                        activeTab === tab.id
                        ? 'text-[#E86C44] border-[#E86C44]'
                        : 'text-muted-foreground border-transparent hover:text-foreground hover:border-muted/50'
                    }`}
                >
                    <i className={`fas ${tab.icon} text-sm`}></i>
                    {tab.label}
                </button>
            ))}
        </div>

        {/* Content Area */}
        <div className="min-h-[400px]">
            {activeTab === 'wallet' && isOwner && (
                <WalletTab 
                    balance={walletBalance} 
                    orders={orders} 
                    onFund={handleFundWallet} 
                    onConfirmOrder={handleConfirmOrder} 
                    onDisputeOrder={handleDisputeOrder}
                    onReviewDispute={handleReviewDispute}
                />
            )}
            
            {activeTab === 'products' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {userProducts.length > 0 ? userProducts.map(p => (
                        <ProductItem 
                            key={p.id} 
                            product={p} 
                            currentUser={user} 
                            onProductClick={onProductClick} 
                            onShare={onShare} 
                            onAddToCart={onAddToCart} 
                            onPromote={(p) => setPromoteItem({ type: 'product', id: p.id, name: p.name })}
                        />
                    )) : (
                        <div className="col-span-full text-center py-20 bg-card rounded-3xl border border-border">
                            <i className="fas fa-heart text-5xl mb-6 opacity-10 block"></i>
                            <h3 className="text-xl font-black uppercase tracking-tight mb-4">No products posted</h3>
                            {isOwner && <button onClick={onPostProduct} className="bg-[#E86C44] text-white px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-[#E86C44]/20">Post Product</button>}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'bookmarks' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {userBookmarks.map(p => (
                        <ProductItem key={p.id} product={p} currentUser={CURRENT_USER} onProductClick={onProductClick} onShare={onShare} onAddToCart={onAddToCart} onPromote={() => {}} />
                    ))}
                    {userBookmarks.length === 0 && <div className="col-span-full text-center py-20 text-muted-foreground font-bold uppercase tracking-widest opacity-40">Your saved items will appear here</div>}
                </div>
            )}

            {/* Other tabs remain similar */}
            {activeTab === 'vrooms' && (
                <div className="space-y-6">
                    {isOwner && (
                        <div className="flex justify-end">
                            <button onClick={() => setIsCreateVroomModalOpen(true)} className="bg-[#E86C44] text-white px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-3 shadow-lg shadow-[#E86C44]/20">
                                <i className="fas fa-plus"></i> Create Vroom
                            </button>
                        </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {userVrooms.map(vroom => (
                            <div key={vroom.id} className="bg-card rounded-2xl border border-border overflow-hidden hover:shadow-xl transition-all group">
                                <div className="h-40 bg-muted relative overflow-hidden">
                                    <img src={vroom.coverImage} alt={vroom.name} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                       <span className="text-white text-[10px] font-black uppercase tracking-widest border border-white/50 px-4 py-2 rounded-lg backdrop-blur-sm">View Store</span>
                                    </div>
                                </div>
                                <div className="p-6">
                                    <h4 className="font-black text-lg uppercase tracking-tight truncate">{vroom.name}</h4>
                                    <p className="text-xs text-muted-foreground font-medium line-clamp-2 mt-2 leading-relaxed opacity-80">{vroom.description}</p>
                                    <div className="mt-4 flex gap-4 text-[10px] font-black text-[#E86C44] uppercase tracking-widest pt-4 border-t border-border/50">
                                        <span>{vroom.products?.length || 0} products</span>
                                        <span>{vroom.followers} followers</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === 'following' && (
                <div className="space-y-4 max-w-2xl mx-auto">
                    {userFollowing.length > 0 ? userFollowing.map(u => (
                        <div key={u.id} className="flex items-center justify-between bg-card p-5 rounded-2xl border border-border shadow-sm">
                            <div className="flex items-center gap-4">
                                <img src={u.avatar} alt={u.name} className="w-12 h-12 rounded-full object-cover border-2 border-border" />
                                <div>
                                    <div className="font-black text-sm uppercase tracking-tight">{u.name}</div>
                                    <div className="text-[10px] font-black text-[#E86C44] tracking-widest">{u.handle}</div>
                                </div>
                            </div>
                            <button className="text-[10px] font-black bg-muted hover:bg-muted/80 px-6 py-2.5 rounded-xl uppercase tracking-widest border border-border transition-all">
                                Following
                            </button>
                        </div>
                    )) : (
                        <div className="text-center py-20 text-muted-foreground font-bold uppercase tracking-widest opacity-40">
                            People you follow will appear here
                        </div>
                    )}
                </div>
            )}

             {activeTab === 'followers' && (
                <div className="space-y-4 max-w-2xl mx-auto">
                    {userFollowers.length > 0 ? userFollowers.map(u => (
                        <div key={u.id} className="flex items-center justify-between bg-card p-5 rounded-2xl border border-border shadow-sm">
                            <div className="flex items-center gap-4">
                                <img src={u.avatar} alt={u.name} className="w-12 h-12 rounded-full object-cover border-2 border-border" />
                                <div>
                                    <div className="font-black text-sm uppercase tracking-tight">{u.name}</div>
                                    <div className="text-[10px] font-black text-[#E86C44] tracking-widest">{u.handle}</div>
                                </div>
                            </div>
                            <button className="text-[10px] font-black bg-[#E86C44] text-white hover:bg-[#d6623e] px-6 py-2.5 rounded-xl uppercase tracking-widest shadow-lg shadow-[#E86C44]/20 transition-all">
                                Follow Back
                            </button>
                        </div>
                    )) : (
                        <div className="text-center py-20 text-muted-foreground font-bold uppercase tracking-widest opacity-40">
                            No followers yet
                        </div>
                    )}
                </div>
            )}
        </div>
      </div>

      {/* Edit Profile Modal */}
      {isEditModalOpen && isOwner && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
           <div className="bg-card rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200 border border-border shadow-2xl">
               <div className="flex items-center justify-between p-8 border-b border-border sticky top-0 bg-card z-10">
                   <h3 className="text-2xl font-black uppercase tracking-tight">Profile Settings</h3>
                   <button onClick={() => setIsEditModalOpen(false)} className="w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-all">
                       <i className="fas fa-times text-xl"></i>
                   </button>
               </div>
               <form onSubmit={handleSaveProfile} className="p-8 space-y-8">
                   <div>
                       <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-4 block">Visual Identity</label>
                       <div className="flex gap-6 items-center">
                            <div className="relative group cursor-pointer w-28 h-28" onClick={() => avatarInputRef.current?.click()}>
                                <img src={formData.avatar || 'https://via.placeholder.com/150'} className="w-full h-full rounded-full object-cover border-4 border-[#E86C44]/30 shadow-xl" />
                                <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <i className="fas fa-camera text-white text-2xl"></i>
                                </div>
                            </div>
                            <div className="flex-1 relative group cursor-pointer h-28 rounded-2xl overflow-hidden border border-border bg-muted shadow-inner" onClick={() => bannerInputRef.current?.click()}>
                                {formData.bannerImage ? (
                                    <img src={formData.bannerImage} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-muted-foreground text-[10px] font-black uppercase tracking-widest flex-col gap-2">
                                        <i className="fas fa-image text-3xl opacity-30"></i>
                                        <span>Upload Banner</span>
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <i className="fas fa-camera text-white text-2xl"></i>
                                </div>
                            </div>
                       </div>
                   </div>

                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       <div className="space-y-2">
                           <label className="text-[10px] font-black text-muted-foreground uppercase ml-1">First Name</label>
                           <input type="text" value={formData.firstName} onChange={(e) => setFormData(p => ({...p, firstName: e.target.value}))} className="w-full px-5 py-4 bg-background border-2 border-border focus:border-[#E86C44] rounded-2xl outline-none font-bold" />
                       </div>
                       <div className="space-y-2">
                           <label className="text-[10px] font-black text-muted-foreground uppercase ml-1">Last Name</label>
                           <input type="text" value={formData.lastName} onChange={(e) => setFormData(p => ({...p, lastName: e.target.value}))} className="w-full px-5 py-4 bg-background border-2 border-border focus:border-[#E86C44] rounded-2xl outline-none font-bold" />
                       </div>
                   </div>
                   
                   <div className="space-y-2">
                       <label className="text-[10px] font-black text-muted-foreground uppercase ml-1">Biography</label>
                       <textarea 
                           value={formData.bio} 
                           onChange={(e) => setFormData(p => ({...p, bio: e.target.value}))} 
                           placeholder="Digital visionary..."
                           className="w-full px-5 py-4 bg-background border-2 border-border focus:border-[#E86C44] rounded-2xl h-32 resize-none outline-none font-medium leading-relaxed" 
                       />
                   </div>
                   
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       <div className="space-y-2">
                           <label className="text-[10px] font-black text-muted-foreground uppercase ml-1">Location</label>
                           <input type="text" value={formData.location} onChange={(e) => setFormData(p => ({...p, location: e.target.value}))} className="w-full px-5 py-4 bg-background border-2 border-border focus:border-[#E86C44] rounded-2xl outline-none font-bold" />
                       </div>
                       <div className="space-y-2">
                           <label className="text-[10px] font-black text-muted-foreground uppercase ml-1">Portfolio/Website</label>
                           <input type="text" value={formData.website} onChange={(e) => setFormData(p => ({...p, website: e.target.value}))} className="w-full px-5 py-4 bg-background border-2 border-border focus:border-[#E86C44] rounded-2xl outline-none font-bold" />
                       </div>
                   </div>

                   <div className="flex justify-end gap-4 pt-8 border-t border-border">
                       <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-8 py-3 rounded-xl border-2 border-border font-black text-[10px] uppercase tracking-widest hover:bg-muted transition-all">Cancel</button>
                       <button type="submit" disabled={saving} className="px-10 py-3 bg-[#E86C44] text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-[#E86C44]/30 hover:brightness-110 active:scale-95 transition-all">
                          {saving ? 'UPDATING...' : 'SAVE CHANGES'}
                       </button>
                   </div>
               </form>
           </div>
        </div>
      )}

      {/* Persistent File Inputs */}
      <input type="file" ref={bannerInputRef} className="hidden" accept="image/*" onChange={(e) => handleFileChange(e, 'banner')} />
      <input type="file" ref={avatarInputRef} className="hidden" accept="image/*" onChange={(e) => handleFileChange(e, 'avatar')} />

      {/* Create Vroom Modal and others... */}
      {isCreateVroomModalOpen && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4 backdrop-blur-md">
            <div className="bg-card rounded-3xl w-full max-w-lg p-8 animate-in zoom-in-95 border border-border shadow-2xl">
                <div className="flex justify-between items-center mb-8">
                   <h3 className="text-2xl font-black uppercase tracking-tight">Create Store</h3>
                   <button onClick={() => setIsCreateVroomModalOpen(false)} className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground">
                       <i className="fas fa-times"></i>
                   </button>
                </div>
                <form onSubmit={handleCreateVroom} className="space-y-6">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-muted-foreground uppercase ml-1">Vroom Name</label>
                        <input type="text" required placeholder="Luxury Collections" value={createVroomData.name} onChange={(e) => setCreateVroomData(p => ({...p, name: e.target.value}))} className="w-full px-5 py-4 border-2 border-border focus:border-[#E86C44] rounded-2xl bg-background outline-none font-bold" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-muted-foreground uppercase ml-1">Description</label>
                        <textarea placeholder="Curation of premium artifacts..." value={createVroomData.description} onChange={(e) => setCreateVroomData(p => ({...p, description: e.target.value}))} className="w-full px-5 py-4 border-2 border-border focus:border-[#E86C44] rounded-2xl bg-background h-32 resize-none outline-none font-medium" />
                    </div>
                    
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-muted-foreground uppercase ml-1">Store Identity</label>
                        <div className="border-2 border-dashed border-border p-8 text-center cursor-pointer rounded-2xl hover:bg-[#E86C44]/5 transition-all group" onClick={() => vroomImageInputRef.current?.click()}>
                            {createVroomData.coverImage ? (
                                <img src={createVroomData.coverImage} className="h-40 w-full object-cover rounded-xl shadow-lg" />
                            ) : (
                                <div className="flex flex-col items-center gap-3">
                                    <i className="fas fa-cloud-upload-alt text-4xl text-muted-foreground opacity-30 group-hover:scale-110 transition-transform"></i>
                                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{uploading ? 'PROCESSING...' : 'Upload Header'}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <input type="file" ref={vroomImageInputRef} className="hidden" accept="image/*" onChange={(e) => handleFileChange(e, 'vroom')} />
                    <button type="submit" disabled={saving || uploading} className="w-full py-5 bg-[#E86C44] text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-[#E86C44]/30 hover:brightness-110 active:scale-95 transition-all">
                        {saving ? 'LAUNCHING...' : 'LAUNCH VROOM'}
                    </button>
                </form>
            </div>
        </div>
      )}

      {/* Detailed Dispute Modal */}
      {activeDisputeOrderId && (
        <FileDisputeModal 
          isOpen={!!activeDisputeOrderId} 
          onClose={() => setActiveDisputeOrderId(null)} 
          orderId={activeDisputeOrderId} 
          onSubmitted={onDisputeSubmitted}
        />
      )}

      {/* Review Dispute Modal */}
      {reviewDisputeOrderId && (
        <ReviewDisputeModal 
          isOpen={!!reviewDisputeOrderId} 
          onClose={() => setReviewDisputeOrderId(null)} 
          orderId={reviewDisputeOrderId} 
          onWithdrawn={onDisputeSubmitted}
        />
      )}

      {/* Promote Modal */}
      {promoteItem && (
          <PromoteModal
              isOpen={!!promoteItem}
              onClose={() => setPromoteItem(null)}
              itemType={promoteItem.type}
              itemId={promoteItem.id}
              itemName={promoteItem.name}
          />
      )}

    </div>
  );
};

export default Profile;
