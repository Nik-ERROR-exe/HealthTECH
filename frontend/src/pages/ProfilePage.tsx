import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { Camera, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import DashboardLayout from '@/components/DashboardLayout';
import { getUser } from '@/lib/auth';
import api from '@/lib/api';

const ProfilePage = () => {
  const user = getUser();
  const isPatient = user?.role === 'PATIENT';
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const { register, handleSubmit, reset } = useForm();

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const endpoint = isPatient ? '/patient/profile' : '/doctor/profile';
      const res = await api.get(endpoint);
      const d = res.data;

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

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold text-foreground mb-6">Profile Settings</h1>

          <div className="glass-card p-6 mb-6">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center text-2xl font-bold text-foreground">
                  {user?.name?.split(' ').map(n => n[0]).join('') || 'U'}
                </div>
                <button className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm hover:opacity-90">
                  <Camera size={12} />
                </button>
              </div>
              <div>
                <p className="font-semibold text-foreground">{user?.name}</p>
                <p className="text-sm text-muted-foreground">{user?.role}</p>
                {user?.patient_id && <p className="text-xs text-primary font-mono mt-1">{user.patient_id}</p>}
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="glass-card p-6 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Full Name</label>
                <input {...register('name')} disabled className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground text-sm outline-none opacity-60 cursor-not-allowed" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Email</label>
                <input {...register('email')} type="email" disabled className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground text-sm outline-none opacity-60 cursor-not-allowed" />
              </div>
            </div>

            {isPatient ? (
              <>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Date of Birth</label>
                    <input {...register('date_of_birth')} type="date" className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground text-sm outline-none focus:ring-2 focus:ring-ring/30" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Blood Group</label>
                    <select {...register('blood_group')} className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground text-sm outline-none focus:ring-2 focus:ring-ring/30">
                      <option value="">Select</option>
                      {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => (
                        <option key={bg} value={bg}>{bg}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <h3 className="text-sm font-semibold text-foreground pt-2">Emergency Contact</h3>
                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Name</label>
                    <input {...register('emergency_contact_name')} placeholder="Contact name" className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/30" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Phone</label>
                    <input {...register('emergency_contact_phone')} placeholder="+1 555-1234" className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/30" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Email</label>
                    <input {...register('emergency_contact_email')} type="email" placeholder="contact@email.com" className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/30" />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Specialization</label>
                    <input {...register('specialization')} placeholder="e.g. Cardiology" className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/30" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Hospital Name</label>
                    <input {...register('hospital_name')} placeholder="Hospital name" className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/30" />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Medical License Number</label>
                  <input {...register('medical_license_number')} placeholder="License number" className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/30" />
                </div>
              </>
            )}

            <button type="submit" disabled={saving} className="px-6 py-2.5 rounded-lg gradient-primary text-primary-foreground font-medium text-sm flex items-center gap-2 hover:opacity-90 disabled:opacity-50">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </motion.div>
      </div>
    </DashboardLayout>
  );
};

export default ProfilePage;
