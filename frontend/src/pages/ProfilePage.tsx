import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { Camera, Save, Loader2, User, Mail, Phone, MapPin, Award, Building, FileText, Calendar, Droplet, Shield, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import DashboardLayout from '@/components/DashboardLayout';
import { getUser } from '@/lib/auth';
import api from '@/lib/api';
import Lenis from '@studio-freight/lenis';

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] } },
};

const ProfilePage = () => {
  const user = getUser();
  const isPatient = user?.role === 'PATIENT';
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { register, handleSubmit, reset, watch } = useForm();

  // Lenis smooth scroll
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1.2,
      touchMultiplier: 2,
    });
    const raf = (time: number) => { lenis.raf(time); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    return () => lenis.destroy();
  }, []);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const endpoint = isPatient ? '/patient/profile' : '/doctor/profile';
      const res = await api.get(endpoint);
      const d = res.data;

      if (d.avatar_url) setAvatarPreview(d.avatar_url);

      if (isPatient) {
        reset({
          name: d.full_name || '',
          email: d.email || '',
          date_of_birth: d.date_of_birth || '',
          blood_group: d.blood_group || '',
          emergency_contact_name: d.emergency_contact_name || '',
          emergency_contact_phone: d.emergency_contact_phone || '',
          emergency_contact_email: d.emergency_contact_email || '',
        });
      } else {
        reset({
          name: d.full_name || '',
          email: d.email || '',
          specialization: d.specialization || '',
          hospital_name: d.hospital_name || '',
          medical_license_number: d.medical_license_number || '',
        });
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Preview
    const reader = new FileReader();
    reader.onload = (e) => setAvatarPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    // Upload
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const endpoint = isPatient ? '/patient/profile/avatar' : '/doctor/profile/avatar';
      await api.post(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Profile photo updated!');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to upload photo');
      // Revert preview on error
      fetchProfile();
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const onSubmit = async (data: any) => {
    setSaving(true);
    try {
      const endpoint = isPatient ? '/patient/profile' : '/doctor/profile';

      if (isPatient) {
        await api.put(endpoint, {
          date_of_birth: data.date_of_birth || null,
          blood_group: data.blood_group || null,
          emergency_contact_name: data.emergency_contact_name || null,
          emergency_contact_phone: data.emergency_contact_phone || null,
          emergency_contact_email: data.emergency_contact_email || null,
        });
      } else {
        await api.put(endpoint, {
          specialization: data.specialization || null,
          hospital_name: data.hospital_name || null,
          medical_license_number: data.medical_license_number || null,
        });
      }

      toast.success('Profile updated successfully!');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const initials = user?.name?.split(' ').map(n => n[0]).join('') || 'U';

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[80vh]">
          <Loader2 className="animate-spin text-primary" size={40} />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="max-w-3xl mx-auto pb-8">
        <h1 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
          <User size={24} className="text-primary" />
          Profile Settings
        </h1>

        {/* Avatar Card */}
        <motion.div variants={fadeUp} className="glass-card rounded-3xl p-6 mb-6 border border-border/50">
          <div className="flex items-center gap-6">
            <div className="relative">
              {avatarPreview ? (
                <img src={avatarPreview} alt="Avatar" className="w-24 h-24 rounded-full object-cover border-2 border-primary/30" />
              ) : (
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-3xl font-bold text-white shadow-lg">
                  {initials}
                </div>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:scale-110 transition-transform disabled:opacity-50"
              >
                {uploadingAvatar ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
              </button>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleAvatarUpload} />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-xl text-foreground">{user?.name}</p>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Shield size={12} className="text-primary" /> {user?.role}
              </p>
              {user?.patient_id && (
                <p className="text-xs text-primary font-mono mt-1 bg-primary/5 px-3 py-1 rounded-full inline-block">
                  {user.patient_id}
                </p>
              )}
            </div>
          </div>
        </motion.div>

        {/* Profile Form */}
        <motion.form variants={fadeUp} onSubmit={handleSubmit(onSubmit)} className="glass-card rounded-3xl p-6 space-y-5 border border-border/50">
          <div className="grid sm:grid-cols-2 gap-5">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                <User size={14} className="text-muted-foreground" /> Full Name
              </label>
              <input {...register('name')} disabled className="w-full px-4 py-2.5 rounded-xl bg-muted/50 border border-border text-foreground text-sm outline-none opacity-60 cursor-not-allowed" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                <Mail size={14} className="text-muted-foreground" /> Email
              </label>
              <input {...register('email')} type="email" disabled className="w-full px-4 py-2.5 rounded-xl bg-muted/50 border border-border text-foreground text-sm outline-none opacity-60 cursor-not-allowed" />
            </div>
          </div>

          {isPatient ? (
            <>
              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                    <Calendar size={14} className="text-muted-foreground" /> Date of Birth
                  </label>
                  <input {...register('date_of_birth')} type="date" className="w-full px-4 py-2.5 rounded-xl bg-muted/50 border border-border text-foreground text-sm outline-none focus:ring-2 focus:ring-ring/30 transition-shadow" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                    <Droplet size={14} className="text-muted-foreground" /> Blood Group
                  </label>
                  <select {...register('blood_group')} className="w-full px-4 py-2.5 rounded-xl bg-muted/50 border border-border text-foreground text-sm outline-none focus:ring-2 focus:ring-ring/30 transition-shadow">
                    <option value="">Select</option>
                    {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => (
                      <option key={bg} value={bg}>{bg}</option>
                    ))}
                  </select>
                </div>
              </div>

              <h3 className="text-base font-semibold text-foreground pt-2 flex items-center gap-2">
                <Phone size={16} className="text-primary" /> Emergency Contact
              </h3>
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Name</label>
                  <input {...register('emergency_contact_name')} placeholder="Contact name" className="w-full px-4 py-2.5 rounded-xl bg-muted/50 border border-border text-foreground text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/30 transition-shadow" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Phone</label>
                  <input {...register('emergency_contact_phone')} placeholder="+1 555-1234" className="w-full px-4 py-2.5 rounded-xl bg-muted/50 border border-border text-foreground text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/30 transition-shadow" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Email</label>
                  <input {...register('emergency_contact_email')} type="email" placeholder="contact@email.com" className="w-full px-4 py-2.5 rounded-xl bg-muted/50 border border-border text-foreground text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/30 transition-shadow" />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                    <Award size={14} className="text-muted-foreground" /> Specialization
                  </label>
                  <input {...register('specialization')} placeholder="e.g. Cardiology" className="w-full px-4 py-2.5 rounded-xl bg-muted/50 border border-border text-foreground text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/30 transition-shadow" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                    <Building size={14} className="text-muted-foreground" /> Hospital Name
                  </label>
                  <input {...register('hospital_name')} placeholder="Hospital name" className="w-full px-4 py-2.5 rounded-xl bg-muted/50 border border-border text-foreground text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/30 transition-shadow" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                  <FileText size={14} className="text-muted-foreground" /> Medical License Number
                </label>
                <input {...register('medical_license_number')} placeholder="License number" className="w-full px-4 py-2.5 rounded-xl bg-muted/50 border border-border text-foreground text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/30 transition-shadow" />
              </div>
            </>
          )}

          <div className="flex justify-end pt-2">
            <button type="submit" disabled={saving} className="px-6 py-2.5 rounded-xl gradient-primary text-primary-foreground font-medium text-sm flex items-center gap-2 hover:opacity-90 disabled:opacity-50 transition-all hover:scale-105 shadow-lg shadow-primary/25">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </motion.form>
      </motion.div>
    </DashboardLayout>
  );
};

export default ProfilePage;