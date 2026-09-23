"use client";

import { FormEvent, useEffect, useState } from "react";
import { RoleGate } from "@/components/RoleGate";
import { EmptyState, PageShell } from "@/components/sih/ui";
import { api, getCurrentProfile } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { LANGUAGES } from "@/lib/languages";
import { MfaSetup } from "@/components/auth/mfa-setup";

type ProfileForm = Record<string, string>;
const fields = [
  ["department", "Department"], ["organization", "Organization"], ["designation", "Designation"],
  ["jobRole", "Job role"], ["currentAssignment", "Current assignment"],
  ["educationalQualification", "Educational qualification"], ["degree", "Degree"],
  ["specialization", "Specialization"], ["desiredCareerRole", "Desired career role"],
  ["languagePreference", "Language preference"]
] as const;
const listFields = ["previousTrainings", "certifications", "currentSkills", "futureSkillInterests"] as const;
const emptyForm: ProfileForm = Object.fromEntries([...fields.map(([key]) => [key, ""]), ["yearsOfExperience", ""], ...listFields.map((key) => [key, ""])]) as ProfileForm;

function toForm(profile: any): ProfileForm {
  const form = { ...emptyForm, ...profile } as ProfileForm;
  form.languagePreference = LANGUAGES.find(([, code]) => code === form.languagePreference)?.[0] || (LANGUAGES.some(([name]) => name === form.languagePreference) ? form.languagePreference : "English");
  form.yearsOfExperience = profile?.yearsOfExperience == null ? "" : String(profile.yearsOfExperience);
  for (const key of listFields) form[key] = (profile?.[key] || []).join(", ");
  return form;
}

function csv(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export default function ProfilePage() {
  return <RoleGate roles={["employee", "faculty", "admin"]}><ProfileContent /></RoleGate>;
}

function ProfileContent() {
  const role = useAppStore((state) => state.user?.activeRole || state.user?.role);
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [roleRequestBusy, setRoleRequestBusy] = useState(false);
  const [roleRequestMessage, setRoleRequestMessage] = useState("");
  const [roleRequestOpen, setRoleRequestOpen] = useState(false);
  const [requestDesignation, setRequestDesignation] = useState("");
  const [requestJustification, setRequestJustification] = useState("");
  const [requestExperience, setRequestExperience] = useState("");
  const [requestDocument, setRequestDocument] = useState<File | null>(null);

  useEffect(() => {
    getCurrentProfile()
      .then((data: any) => setForm(toForm(data.profile)))
      .catch(() => setError("Could not load your competency profile."))
      .finally(() => setLoading(false));
  }, []);

  function update(field: string, value: string) { setForm((current) => ({ ...current, [field]: value })); }

  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    const payload: any = { ...form, yearsOfExperience: form.yearsOfExperience === "" ? undefined : Number(form.yearsOfExperience) };
    for (const key of listFields) payload[key] = csv(form[key]);
    try {
      const { data } = await api.put("/profile/me", payload);
      setForm(toForm(data.profile)); setMessage(data.message || "Profile saved.");
    } catch (err: any) { setError(err?.response?.data?.message || "Could not save your profile."); }
    finally { setSaving(false); }
  }

  function openFacultyRequest() {
    setRequestDesignation(form.designation || "");
    setRequestJustification("");
    setRequestExperience("");
    setRequestDocument(null);
    setRoleRequestMessage("");
    setRoleRequestOpen(true);
  }

  async function requestFacultyAccess(event: FormEvent) {
    event.preventDefault();
    setRoleRequestBusy(true);
    setRoleRequestMessage("");
    try {
      const body = new FormData();
      body.append("designation", requestDesignation);
      body.append("justification", requestJustification);
      body.append("experienceNotes", requestExperience);
      if (requestDocument) body.append("supportingDocument", requestDocument);
      await api.post("/role-requests/faculty", body, { headers: { "Content-Type": "multipart/form-data" } });
      setRoleRequestMessage("Faculty access request submitted for administrator review.");
      setRoleRequestOpen(false);
    } catch (err: any) {
      setRoleRequestMessage(err?.response?.data?.message || "Could not submit faculty access request.");
    } finally {
      setRoleRequestBusy(false);
    }
  }

  const [activeTab, setActiveTab] = useState<"profile" | "preferences" | "security" | "notifications">("profile");

  if (loading) return <PageShell title="Competency Profile" subtitle="Loading profile…" />;
  if (error && !form.department && !form.jobRole) return <PageShell title="Competency Profile"><EmptyState message={error} /></PageShell>;

  return <PageShell title="Profile & settings" subtitle="Keep your identity and evidence current so competency scores, gaps, and recommendations stay relevant.">
    <div className="profile-tabs">
      <span className={activeTab === "profile" ? "is-active cursor-pointer" : "cursor-pointer"} onClick={() => setActiveTab("profile")}>Profile</span>
      <span className={activeTab === "preferences" ? "is-active cursor-pointer" : "cursor-pointer"} onClick={() => setActiveTab("preferences")}>Preferences</span>
      <span className={activeTab === "security" ? "is-active cursor-pointer" : "cursor-pointer"} onClick={() => setActiveTab("security")}>Security</span>
      <span className={activeTab === "notifications" ? "is-active cursor-pointer" : "cursor-pointer"} onClick={() => setActiveTab("notifications")}>Notifications</span>
    </div>
    
    {activeTab === "profile" && (
      <>
        <form onSubmit={save} className="profile-form sih-panel space-y-6 p-4 sm:p-6">
          {error ? <EmptyState message={error} /> : null}
          {message ? <p className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-200">{message}</p> : null}
      <div className="profile-section-heading"><div><p className="eyebrow">IDENTITY & ROLE</p><h2>Professional profile</h2></div><span>Used to contextualize your competency path</span></div><div className="grid gap-4 md:grid-cols-2">
        {fields.map(([field, label]) => <label key={field} className="text-sm text-zinc-300">{label}{field === "languagePreference" ? <select value={form[field]} onChange={(event) => update(field, event.target.value)} className="sih-field mt-2 w-full">{LANGUAGES.map(([name, code, tier]) => <option key={code} value={name}>{name}{tier === 2 ? " · Beta" : ""}</option>)}</select> : <input value={form[field]} onChange={(event) => update(field, event.target.value)} className="sih-field mt-2 w-full" />}</label>)}
        <label className="text-sm text-zinc-300">Years of experience<input type="number" min="0" max="50" value={form.yearsOfExperience} onChange={(event) => update("yearsOfExperience", event.target.value)} className="sih-field mt-2 w-full" /></label>
      </div>
      <div className="profile-section-heading"><div><p className="eyebrow">EVIDENCE & INTERESTS</p><h2>Learning context</h2></div><span>Use comma-separated values for multiple entries</span></div><div className="grid gap-4 md:grid-cols-2">
        {listFields.map((field) => <label key={field} className="text-sm text-zinc-300">{field.replace(/[A-Z]/g, (letter) => ` ${letter}`).replace(/^./, (letter) => letter.toUpperCase())} <span className="text-zinc-500">(comma separated)</span><textarea value={form[field]} onChange={(event) => update(field, event.target.value)} rows={3} className="sih-field mt-2 w-full" /></label>)}
      </div>
      <button disabled={saving} className="sih-button-primary">{saving ? "Saving…" : "Save profile and refresh competency evidence"}</button>
    </form>
    {role === "employee" ? <div className="sih-panel mt-5">
      <h2 className="font-medium text-white">Faculty access</h2>
      <p className="mt-1 text-sm text-zinc-400">Request trainer permissions. An administrator must approve this request before the Faculty workspace is enabled.</p>
      <button type="button" disabled={roleRequestBusy} onClick={openFacultyRequest} className="sih-button-secondary mt-4">Request Faculty Access</button>
      {roleRequestOpen ? <form onSubmit={requestFacultyAccess} className="mt-5 space-y-4 rounded-xl border border-cyan-400/15 bg-black/10 p-4">
        <div><label className="text-sm text-zinc-300">Designation / current job role</label><input required minLength={2} maxLength={160} value={requestDesignation} onChange={(event) => setRequestDesignation(event.target.value)} className="sih-field mt-2 w-full" placeholder="e.g. Deputy Director" /></div>
        <div><label className="text-sm text-zinc-300">Why are you requesting Faculty access?</label><textarea required minLength={20} maxLength={1200} value={requestJustification} onChange={(event) => setRequestJustification(event.target.value)} className="sih-field mt-2 w-full" rows={4} placeholder="Describe your relevant training experience or subject expertise." /><p className="mt-1 text-xs text-zinc-500">At least 20 characters.</p></div>
        <div><label className="text-sm text-zinc-300">Certifications or prior training experience <span className="text-zinc-500">(optional)</span></label><textarea maxLength={1200} value={requestExperience} onChange={(event) => setRequestExperience(event.target.value)} className="sih-field mt-2 w-full" rows={3} placeholder="Mention relevant certifications, courses, or mentoring experience." /></div>
        <div><label className="text-sm text-zinc-300">Supporting document <span className="text-zinc-500">(optional: certificate, CV, or experience letter)</span></label><input type="file" accept=".pdf,.docx,.pptx,.txt,.md" onChange={(event) => setRequestDocument(event.target.files?.[0] || null)} className="mt-2 block w-full text-sm text-zinc-300" /></div>
        <div className="flex flex-wrap gap-2"><button type="submit" disabled={roleRequestBusy} className="sih-button-primary">{roleRequestBusy ? "Submitting…" : "Submit request"}</button><button type="button" disabled={roleRequestBusy} onClick={() => setRoleRequestOpen(false)} className="sih-button-secondary">Cancel</button></div>
      </form> : null}
          {roleRequestMessage ? <p className="mt-3 text-sm text-zinc-300">{roleRequestMessage}</p> : null}
        </div> : null}
      </>
    )}

    {activeTab === "security" && (
      <MfaSetup />
    )}
  </PageShell>;
}
