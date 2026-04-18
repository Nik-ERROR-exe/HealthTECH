import { useState } from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { ChevronRight, ChevronLeft, Check, Search, Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import api from '@/lib/api';

interface MedicationInput {
  name: string;
  dosage: string;
  frequency: string;
  time_of_day: string;
  special_instructions: string;
}

interface FoundPatient {
  patient_id: string;
  full_name: string;
  email: string;
  unique_uid: string;
}

const CONDITION_TYPES = [
  { value: 'POST_KIDNEY_TRANSPLANT', label: 'Post Kidney Transplant' },
  { value: 'POST_CARDIAC_SURGERY', label: 'Post Cardiac Surgery' },
  { value: 'ASTHMA_RESPIRATORY', label: 'Asthma / Respiratory' },
  { value: 'DIABETES_MANAGEMENT', label: 'Diabetes Management' },
  { value: 'GENERAL_POST_SURGERY', label: 'General Post Surgery' },
];

const CreateCourse = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [medications, setMedications] = useState<MedicationInput[]>([
    { name: '', dosage: '', frequency: 'Once daily', time_of_day: '', special_instructions: '' },
  ]);
  const [patientSearch, setPatientSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [foundPatient, setFoundPatient] = useState<FoundPatient | null>(null);
  const [creating, setCreating] = useState(false);
  const { register, handleSubmit, formState: { errors }, getValues } = useForm();

  const addMed = () => setMedications([...medications, { name: '', dosage: '', frequency: 'Once daily', time_of_day: '', special_instructions: '' }]);
  const removeMed = (i: number) => setMedications(medications.filter((_, idx) => idx !== i));
  const updateMed = (i: number, field: keyof MedicationInput, value: string) => {
    const updated = [...medications];
    updated[i][field] = value;
    setMedications(updated);
  };

  const searchPatient = async () => {
    if (!patientSearch.trim()) return;
    setSearching(true);
    setFoundPatient(null);
    try {
      const res = await api.get(`/doctor/find-patient?uid=${encodeURIComponent(patientSearch.trim())}`);
      setFoundPatient(res.data);
      toast.success(`Found: ${res.data.full_name}`);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Patient not found. Make sure to use their CNT-XXXXX ID.');
    } finally {
      setSearching(false);
    }
  };

  const onSubmit = () => {
    if (step < 3) {
      setStep(step + 1);
      return;
    }
    createCourse();
  };

  const createCourse = async () => {
    if (!foundPatient) {
      toast.error('Please find and select a patient first');
      return;
    }

    const validMedications = medications.filter(m => m.name.trim());
    if (validMedications.length === 0) {
      toast.error('Please add at least one medication');
      return;
    }

    const formValues = getValues();
    setCreating(true);

    try {
      // Step 1: Create the course
      const courseRes = await api.post('/doctor/courses', {
        course_name: formValues.name,
        condition_type: formValues.condition_type,
        start_date: formValues.startDate,
        end_date: formValues.endDate,
        notes_for_patient: formValues.notes || null,
        medications: validMedications.map(m => ({
          name: m.name,
          dosage: m.dosage,
          frequency: m.frequency,
          time_of_day: m.time_of_day || null,
          special_instructions: m.special_instructions || null,
        })),
      });

      const courseId = courseRes.data.course_id;

      // Step 2: Assign the course to the patient
      await api.post(`/doctor/courses/${courseId}/assign`, {
        patient_unique_uid: foundPatient.unique_uid,
      });

      toast.success(`Course created and assigned to ${foundPatient.full_name}!`);
      navigate('/doctor/dashboard');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to create course');
    } finally {
      setCreating(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                step >= s ? 'gradient-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}>
                {step > s ? <Check size={14} /> : s}
              </div>
              <span className={`text-sm hidden sm:block ${step >= s ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                {s === 1 ? 'Details' : s === 2 ? 'Medications' : 'Assign'}
              </span>
              {s < 3 && <div className={`flex-1 h-0.5 ${step > s ? 'bg-primary' : 'bg-border'}`} />}
            </div>
          ))}
        </div>

        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="glass-card p-6"
        >
          {step === 1 && (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">Course Details</h2>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Course Name</label>
                <input {...register('name', { required: true })} placeholder="e.g. Post-Surgery Recovery" className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/30" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Condition Type</label>
                <select {...register('condition_type', { required: true })} className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground text-sm outline-none focus:ring-2 focus:ring-ring/30">
                  <option value="">Select condition...</option>
                  {CONDITION_TYPES.map(ct => (
                    <option key={ct.value} value={ct.value}>{ct.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Start Date</label>
                  <input type="date" {...register('startDate', { required: true })} className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground text-sm outline-none focus:ring-2 focus:ring-ring/30" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">End Date</label>
                  <input type="date" {...register('endDate', { required: true })} className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground text-sm outline-none focus:ring-2 focus:ring-ring/30" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Notes for Patient (optional)</label>
                <textarea {...register('notes')} rows={3} placeholder="Instructions or notes for the patient..." className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/30 resize-none" />
              </div>
              <button type="submit" className="w-full py-2.5 rounded-lg gradient-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-2">
                Next <ChevronRight size={16} />
              </button>
            </form>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">Medications</h2>
              {medications.map((med, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5">
                    {i === 0 && <label className="text-xs font-medium text-muted-foreground mb-1 block">Name</label>}
                    <input
                      value={med.name}
                      onChange={(e) => updateMed(i, 'name', e.target.value)}
                      placeholder="Medication name"
                      className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-foreground text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/30"
                    />
                  </div>
                  <div className="col-span-3">
                    {i === 0 && <label className="text-xs font-medium text-muted-foreground mb-1 block">Dosage</label>}
                    <input
                      value={med.dosage}
                      onChange={(e) => updateMed(i, 'dosage', e.target.value)}
                      placeholder="500mg"
                      className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-foreground text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/30"
                    />
                  </div>
                  <div className="col-span-3">
                    {i === 0 && <label className="text-xs font-medium text-muted-foreground mb-1 block">Frequency</label>}
                    <select
                      value={med.frequency}
                      onChange={(e) => updateMed(i, 'frequency', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-foreground text-sm outline-none focus:ring-2 focus:ring-ring/30"
                    >
                      <option>Once daily</option>
                      <option>Twice daily</option>
                      <option>Three times daily</option>
                      <option>As needed</option>
                    </select>
                  </div>
                  <div className="col-span-1">
                    {medications.length > 1 && (
                      <button onClick={() => removeMed(i)} className="p-2 text-muted-foreground hover:text-destructive"><Trash2 size={16} /></button>
                    )}
                  </div>
                </div>
              ))}
              <button onClick={addMed} className="text-sm text-primary font-medium flex items-center gap-1 hover:underline">
                <Plus size={14} /> Add Medication
              </button>
              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="flex-1 py-2.5 rounded-lg border border-border text-foreground text-sm font-medium flex items-center justify-center gap-2">
                  <ChevronLeft size={16} /> Back
                </button>
                <button onClick={() => setStep(3)} className="flex-1 py-2.5 rounded-lg gradient-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-2">
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">Assign Patient</h2>
              <p className="text-sm text-muted-foreground">Enter the patient's unique ID (CNT-XXXXX) to find and assign them.</p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchPatient()}
                    placeholder="Enter patient ID (e.g. CNT-48291)..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-muted border border-border text-foreground text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/30"
                  />
                </div>
                <button
                  onClick={searchPatient}
                  disabled={searching}
                  className="px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground text-sm font-medium hover:bg-muted/80 disabled:opacity-50"
                >
                  {searching ? <Loader2 size={16} className="animate-spin" /> : 'Search'}
                </button>
              </div>

              {foundPatient && (
                <div className="p-4 rounded-lg border border-primary bg-primary/5 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-foreground">
                    {foundPatient.full_name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{foundPatient.full_name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{foundPatient.unique_uid} · {foundPatient.email}</p>
                  </div>
                  <Check size={18} className="text-primary" />
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setStep(2)} className="flex-1 py-2.5 rounded-lg border border-border text-foreground text-sm font-medium flex items-center justify-center gap-2">
                  <ChevronLeft size={16} /> Back
                </button>
                <button
                  onClick={createCourse}
                  disabled={!foundPatient || creating}
                  className="flex-1 py-2.5 rounded-lg gradient-primary text-primary-foreground font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {creating ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  {creating ? 'Creating...' : 'Create Course'}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </DashboardLayout>
  );
};

export default CreateCourse;
