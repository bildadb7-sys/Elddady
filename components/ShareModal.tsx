
import React from 'react';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  productName: string;
  productUrl: string;
}

const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, productName, productUrl }) => {
  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(productUrl);
    alert("Link copied to clipboard!");
  };

  // Actions here are just openings, the increment logic is triggered when modal opens in parent
  // However, we can also add logic here if we wanted granular tracking per platform.
  // For now, the generic increment in parent handles "Attempt to Share".

  const shareOptions = [
    { name: 'WhatsApp', icon: 'fab fa-whatsapp', color: 'text-green-500', action: () => window.open(`https://wa.me/?text=${encodeURIComponent(productUrl)}`, '_blank') },
    { name: 'Twitter', icon: 'fab fa-twitter', color: 'text-blue-400', action: () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(productName)}&url=${encodeURIComponent(productUrl)}`, '_blank') },
    { name: 'Facebook', icon: 'fab fa-facebook', color: 'text-blue-600', action: () => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(productUrl)}`, '_blank') },
    { name: 'Email', icon: 'fas fa-envelope', color: 'text-gray-600', action: () => window.open(`mailto:?subject=Check out this product&body=${encodeURIComponent(productUrl)}`, '_blank') },
  ];

  // Generate QR Code URL
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(productUrl)}`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card w-full max-w-sm rounded-xl p-6 shadow-xl animate-in zoom-in-95 flex flex-col max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold">Share Product</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>

        {/* Social Options */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {shareOptions.map((opt) => (
            <button 
              key={opt.name} 
              onClick={opt.action}
              className="flex flex-col items-center gap-2 hover:bg-muted/50 p-2 rounded-lg transition-colors group"
            >
              <div className={`w-12 h-12 bg-muted rounded-full flex items-center justify-center ${opt.color} group-hover:scale-110 transition-transform`}>
                <i className={`${opt.icon} text-xl`}></i>
              </div>
              <span className="text-xs font-medium">{opt.name}</span>
            </button>
          ))}
        </div>

        {/* QR Code Section */}
        <div className="flex flex-col items-center mb-6 p-4 bg-white rounded-xl border border-border/50 shadow-sm">
            <img 
                src={qrCodeUrl} 
                alt="QR Code" 
                className="w-32 h-32 object-contain mix-blend-multiply" 
            />
            <p className="text-xs text-muted-foreground mt-2 font-medium">Scan to view on mobile</p>
        </div>

        {/* Copy Link Section */}
        <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground ml-1">Or copy link</label>
            <div className="flex items-center gap-2 p-2 border border-border rounded-lg bg-muted/20">
                <i className="fas fa-link text-muted-foreground ml-2 text-sm"></i>
                <input 
                    type="text" 
                    readOnly 
                    value={productUrl} 
                    className="flex-1 bg-transparent text-sm text-foreground outline-none truncate"
                />
                <button 
                    onClick={handleCopy}
                    className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-xs font-bold hover:bg-primary/90 transition-colors shadow-sm"
                >
                    Copy
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ShareModal;
