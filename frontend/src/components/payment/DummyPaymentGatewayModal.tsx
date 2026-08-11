import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, CheckCircle2, ShieldCheck, CreditCard, Smartphone,
  Building2, Wallet, Lock, ChevronDown, ChevronUp, Sparkles, Loader2,
  Gift, Check, HelpCircle
} from 'lucide-react';
import { toast } from 'sonner';

interface DummyPaymentGatewayModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (txnId: string) => void;
  courseName: string;
  doctorName: string;
  amount?: number;
  patientId?: string;
}

export const DummyPaymentGatewayModal = ({
  isOpen,
  onClose,
  onSuccess,
  courseName,
  doctorName,
  amount = 2499,
  patientId = 'CN-PATIENT'
}: DummyPaymentGatewayModalProps) => {
  const [selectedMethod, setSelectedMethod] = useState<'upi' | 'card' | 'bank' | 'wallet'>('upi');
  const [selectedProvider, setSelectedProvider] = useState<string>('gpay');
  const [showDetails, setShowDetails] = useState(false);
  const [paymentState, setPaymentState] = useState<'selecting' | 'processing' | 'success'>('selecting');
  const [txnId, setTxnId] = useState('');
  
  // Dummy form states
  const [upiId, setUpiId] = useState('patient@okaxis');
  const [cardNumber, setCardNumber] = useState('4532 •••• •••• 8921');
  const [cardExpiry, setCardExpiry] = useState('08/28');
  const [cardCvv, setCardCvv] = useState('•••');
  const [cardName, setCardName] = useState('Valued Patient');
  const [selectedBank, setSelectedBank] = useState('HDFC Bank');
  const [selectedWallet, setSelectedWallet] = useState('Paytm Wallet');
  const [useVoucher, setUseVoucher] = useState(false);
  const [voucherCode, setVoucherCode] = useState('');

  if (!isOpen) return null;

  const handlePay = () => {
    setPaymentState('processing');
    
    // Simulate gateway delay
    setTimeout(() => {
      const generatedTxnId = `CNT-TXN-${Math.floor(100000 + Math.random() * 900000)}`;
      setTxnId(generatedTxnId);
      setPaymentState('success');
      toast.success('Payment completed successfully!');
    }, 1800);
  };

  const handleContinue = () => {
    onSuccess(txnId);
    setPaymentState('selecting');
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 overflow-y-auto bg-black/70 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="relative w-full max-w-4xl bg-card rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[92vh]"
        >
          {/* Top Bar Header */}
          <div className="bg-emerald-600 dark:bg-emerald-700 text-white px-4 sm:px-6 py-3 flex items-center justify-between shadow-md shrink-0">
            <button
              onClick={onClose}
              disabled={paymentState === 'processing'}
              className="flex items-center gap-1.5 text-xs sm:text-sm font-medium hover:text-emerald-100 transition-colors disabled:opacity-50"
            >
              <ArrowLeft size={16} />
              <span>Return to merchant</span>
            </button>

            <div className="flex items-center gap-2">
              <div className="bg-white/20 p-1 rounded-md backdrop-blur-sm">
                <ShieldCheck size={18} className="text-white" />
              </div>
              <span className="font-bold text-sm sm:text-base tracking-tight">CARENETRA</span>
              <span className="text-[10px] sm:text-xs text-emerald-100 bg-white/10 px-1.5 py-0.5 rounded font-mono">
                SECURE GATEWAY
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs text-emerald-100 font-medium">
              <Lock size={13} />
              <span className="hidden sm:inline">256-Bit SSL Encrypted</span>
            </div>
          </div>

          {paymentState === 'processing' ? (
            /* Processing State */
            <div className="p-12 sm:p-16 flex flex-col items-center justify-center text-center space-y-6 min-h-[420px]">
              <div className="relative">
                <div className="w-20 h-20 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin flex items-center justify-center" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <ShieldCheck className="text-emerald-500 animate-pulse" size={28} />
                </div>
              </div>
              <div className="space-y-2 max-w-sm">
                <h3 className="text-xl font-bold text-foreground">Processing Payment...</h3>
                <p className="text-sm text-muted-foreground">
                  Connecting to CARENETRA Health Services & verifying transaction credentials securely.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono bg-muted/60 text-muted-foreground px-4 py-2 rounded-full border border-border">
                <Loader2 className="animate-spin text-emerald-500" size={14} />
                <span>Do not refresh or close this window</span>
              </div>
            </div>
          ) : paymentState === 'success' ? (
            /* Success State */
            <div className="p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-6 min-h-[420px]">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 12 }}
                className="w-20 h-20 bg-emerald-500/10 text-emerald-500 border-2 border-emerald-500/30 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/10"
              >
                <CheckCircle2 size={44} />
              </motion.div>

              <div className="space-y-2 max-w-md">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full">
                  ✓ Payment Successful
                </span>
                <h3 className="text-2xl font-bold text-foreground pt-1">Your Care Plan is now unlocked.</h3>
                <p className="text-sm text-muted-foreground">
                  You now have full access to your personalized medical course, medications, daily CARA AI monitoring, and care services.
                </p>
              </div>

              <div className="bg-muted/50 border border-border rounded-xl p-4 w-full max-w-sm text-left space-y-2 text-sm font-mono">
                <div className="flex justify-between items-center text-xs text-muted-foreground border-b border-border pb-2">
                  <span>Transaction ID</span>
                  <span className="font-bold text-foreground">{txnId}</span>
                </div>
                <div className="flex justify-between items-center text-xs text-muted-foreground pt-1">
                  <span>Amount Paid</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">₹{amount.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <span>Course Plan</span>
                  <span className="text-foreground truncate max-w-[180px]">{courseName}</span>
                </div>
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <span>Patient ID</span>
                  <span className="text-foreground">{patientId}</span>
                </div>
              </div>

              <button
                onClick={handleContinue}
                className="w-full max-w-sm py-3.5 px-6 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-semibold rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Sparkles size={18} />
                <span>Continue to CARENETRA</span>
              </button>
            </div>
          ) : (
            /* Main Payment Gateway Selection Grid (Reference Inspired) */
            <div className="grid grid-cols-1 md:grid-cols-12 overflow-y-auto grow">
              {/* Left Column: Order Summary (Reference design style) */}
              <div className="md:col-span-4 bg-muted/40 p-5 sm:p-6 border-b md:border-b-0 md:border-r border-border flex flex-col justify-between">
                <div className="space-y-5">
                  <div>
                    <h3 className="text-lg font-bold text-foreground">My order</h3>
                    <p className="text-xs text-muted-foreground">Subscription & Care Monitoring</p>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Merchant</span>
                      <span className="font-semibold text-foreground">CARENETRA Health Services AS</span>
                    </div>

                    <button
                      onClick={() => setShowDetails(!showDetails)}
                      className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 hover:underline text-xs"
                    >
                      <span>{showDetails ? 'Hide detailed info' : 'Show detailed info'}</span>
                      {showDetails ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>

                    <AnimatePresence>
                      {showDetails && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="bg-card p-3 rounded-lg border border-border space-y-1.5 text-[11px]"
                        >
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Course:</span>
                            <span className="font-medium text-foreground truncate max-w-[140px]">{courseName}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Doctor:</span>
                            <span className="font-medium text-foreground">{doctorName}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Patient UID:</span>
                            <span className="font-mono text-foreground">{patientId}</span>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div>
                      <span className="text-muted-foreground block text-[11px]">Payment descriptor</span>
                      <span className="font-mono text-foreground text-[11px] block truncate">
                        CareNetra Medical Course Unlock (Ref: {patientId})
                      </span>
                    </div>

                    <div>
                      <span className="text-muted-foreground block text-[11px]">Payee</span>
                      <span className="font-medium text-foreground">CARENETRA Healthcare India</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border">
                    <span className="text-xs text-muted-foreground block">Payment amount</span>
                    <div className="text-3xl font-extrabold text-foreground tracking-tight flex items-baseline gap-1">
                      <span>₹{amount.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                </div>

                {/* Patient illustration / healthcare badge card */}
                <div className="mt-6 pt-4 border-t border-border flex items-center gap-3 bg-emerald-500/5 dark:bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                    <Sparkles size={20} className="text-emerald-500" />
                  </div>
                  <div className="text-[11px]">
                    <span className="font-bold text-foreground block">Instant Activation</span>
                    <span className="text-muted-foreground">Unlocks full dashboard & CARA AI monitoring instantly</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Payment Method Selection & Inputs */}
              <div className="md:col-span-8 p-5 sm:p-6 flex flex-col justify-between space-y-6">
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-foreground">Choose payment method</h3>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <span>India</span>
                      <ChevronDown size={12} />
                    </span>
                  </div>

                  {/* Payment Method Selector Tabs */}
                  <div className="grid grid-cols-4 gap-2 p-1 bg-muted/60 rounded-xl border border-border">
                    {[
                      { id: 'upi', label: 'UPI', icon: Smartphone },
                      { id: 'card', label: 'Card', icon: CreditCard },
                      { id: 'bank', label: 'Net Banking', icon: Building2 },
                      { id: 'wallet', label: 'Wallet', icon: Wallet },
                    ].map(tab => {
                      const Icon = tab.icon;
                      const active = selectedMethod === tab.id;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => setSelectedMethod(tab.id as any)}
                          className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                            active
                              ? 'bg-card text-emerald-600 dark:text-emerald-400 shadow border border-border'
                              : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
                          }`}
                        >
                          <Icon size={16} />
                          <span>{tab.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Tab Contents */}
                  <div className="space-y-4 pt-1">
                    {/* UPI Option */}
                    {selectedMethod === 'upi' && (
                      <div className="space-y-4">
                        <span className="text-xs font-semibold text-muted-foreground block uppercase tracking-wider">
                          Popular UPI Apps
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {[
                            { id: 'gpay', name: 'Google Pay', color: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
                            { id: 'phonepe', name: 'PhonePe', color: 'bg-purple-500/10 text-purple-600 border-purple-500/30' },
                            { id: 'paytm_upi', name: 'Paytm UPI', color: 'bg-sky-500/10 text-sky-600 border-sky-500/30' },
                            { id: 'bhim', name: 'BHIM UPI', color: 'bg-orange-500/10 text-orange-600 border-orange-500/30' },
                          ].map(app => (
                            <button
                              key={app.id}
                              onClick={() => setSelectedProvider(app.id)}
                              className={`relative p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                selectedProvider === app.id
                                  ? `${app.color} ring-2 ring-emerald-500 border-emerald-500 shadow-sm`
                                  : 'bg-card border-border hover:border-emerald-500/40'
                              }`}
                            >
                              {selectedProvider === app.id && (
                                <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-emerald-500 text-white rounded-full flex items-center justify-center text-[10px]">
                                  <Check size={10} />
                                </span>
                              )}
                              <Smartphone size={20} />
                              <span className="text-xs font-bold text-foreground">{app.name}</span>
                            </button>
                          ))}
                        </div>

                        <div className="space-y-1.5 pt-2">
                          <label className="text-xs font-medium text-foreground">VPA / UPI ID</label>
                          <input
                            type="text"
                            value={upiId}
                            onChange={e => setUpiId(e.target.value)}
                            placeholder="username@upi"
                            className="w-full px-3.5 py-2.5 bg-background border border-border rounded-lg text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                          <p className="text-[11px] text-muted-foreground">Demo UPI ID ready for instant authorization</p>
                        </div>
                      </div>
                    )}

                    {/* Card Option */}
                    {selectedMethod === 'card' && (
                      <div className="space-y-3">
                        <div className="flex gap-2 pb-1">
                          <span className="px-2 py-1 bg-muted rounded border text-[11px] font-bold">VISA</span>
                          <span className="px-2 py-1 bg-muted rounded border text-[11px] font-bold">Mastercard</span>
                          <span className="px-2 py-1 bg-muted rounded border text-[11px] font-bold">RuPay</span>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-foreground">Card Number</label>
                          <input
                            type="text"
                            value={cardNumber}
                            onChange={e => setCardNumber(e.target.value)}
                            className="w-full px-3.5 py-2 bg-background border border-border rounded-lg text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-foreground">Expiry Date</label>
                            <input
                              type="text"
                              value={cardExpiry}
                              onChange={e => setCardExpiry(e.target.value)}
                              className="w-full px-3.5 py-2 bg-background border border-border rounded-lg text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-foreground">CVV</label>
                            <input
                              type="password"
                              value={cardCvv}
                              maxLength={3}
                              onChange={e => setCardCvv(e.target.value)}
                              className="w-full px-3.5 py-2 bg-background border border-border rounded-lg text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-foreground">Cardholder Name</label>
                          <input
                            type="text"
                            value={cardName}
                            onChange={e => setCardName(e.target.value)}
                            className="w-full px-3.5 py-2 bg-background border border-border rounded-lg text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      </div>
                    )}

                    {/* Net Banking Option */}
                    {selectedMethod === 'bank' && (
                      <div className="space-y-3">
                        <span className="text-xs font-semibold text-muted-foreground block uppercase tracking-wider">
                          Select Preferred Bank
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                          {['HDFC Bank', 'State Bank of India', 'ICICI Bank', 'Axis Bank', 'Kotak Bank', 'Punjab National Bank'].map(bank => (
                            <button
                              key={bank}
                              onClick={() => setSelectedBank(bank)}
                              className={`p-2.5 rounded-xl border text-xs font-medium transition-all text-left flex items-center justify-between cursor-pointer ${
                                selectedBank === bank
                                  ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold'
                                  : 'bg-card border-border hover:border-emerald-500/40 text-foreground'
                              }`}
                            >
                              <span>{bank}</span>
                              {selectedBank === bank && <Check size={14} className="text-emerald-500" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Wallet Option */}
                    {selectedMethod === 'wallet' && (
                      <div className="space-y-3">
                        <span className="text-xs font-semibold text-muted-foreground block uppercase tracking-wider">
                          Select Wallet
                        </span>
                        <div className="grid grid-cols-2 gap-3">
                          {['Paytm Wallet', 'Amazon Pay', 'Mobikwik', 'PhonePe Wallet'].map(wallet => (
                            <button
                              key={wallet}
                              onClick={() => setSelectedWallet(wallet)}
                              className={`p-3 rounded-xl border text-xs font-semibold transition-all flex items-center justify-between cursor-pointer ${
                                selectedWallet === wallet
                                  ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-card border-border hover:border-emerald-500/40 text-foreground'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <Wallet size={16} />
                                <span>{wallet}</span>
                              </div>
                              {selectedWallet === wallet && <Check size={14} className="text-emerald-500" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Gift Card / Voucher Checkbox Option (Inspired by reference screenshot) */}
                  <div className="pt-2 border-t border-border">
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs text-foreground select-none">
                      <input
                        type="checkbox"
                        checked={useVoucher}
                        onChange={e => setUseVoucher(e.target.checked)}
                        className="rounded border-border text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                      />
                      <Gift size={14} className="text-emerald-500" />
                      <span>I want to use a CARENETRA promo voucher</span>
                    </label>

                    {useVoucher && (
                      <div className="mt-2 flex gap-2">
                        <input
                          type="text"
                          value={voucherCode}
                          onChange={e => setVoucherCode(e.target.value)}
                          placeholder="e.g. CARENETRA50"
                          className="px-3 py-1.5 bg-background border border-border rounded-lg text-xs font-mono text-foreground grow"
                        />
                        <button
                          type="button"
                          onClick={() => toast.success('Voucher applied!')}
                          className="px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground rounded-lg text-xs font-medium cursor-pointer"
                        >
                          Apply
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Primary Action Pay Button (Vibrant Green matching reference screenshot) */}
                <div className="space-y-2 pt-2">
                  <button
                    onClick={handlePay}
                    className="w-full py-3.5 px-6 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-bold rounded-xl shadow-lg shadow-emerald-600/25 transition-all text-center flex items-center justify-center gap-2 cursor-pointer text-base"
                  >
                    <span>Pay ₹{amount.toLocaleString('en-IN')}</span>
                  </button>
                  <p className="text-[11px] text-center text-muted-foreground flex items-center justify-center gap-1">
                    <ShieldCheck size={12} className="text-emerald-500" />
                    <span>Demo mode — No real transaction will occur</span>
                  </p>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default DummyPaymentGatewayModal;
