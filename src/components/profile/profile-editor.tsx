"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type EditableProfile = {
  username: string;
  fullName?: string | null;
  headline?: string | null;
  bio?: string | null;
  location?: string | null;
  status?: string | null;
  availability?: string | null;
  avatarUrl?: string | null;
  websiteUrl?: string | null;
  visibility: string;
  messagingPermission: string;
  connectionPermission: string;
  socialLinks?: { linkedin?: string; github?: string; x?: string } | null;
};

type EditableProduct = {
  id?: string;
  name?: string | null;
  role?: string | null;
  description?: string | null;
  category?: string | null;
  stage?: string | null;
  teamSize?: number | null;
  fundingStatus?: string | null;
  tractionMetric?: string | null;
  websiteUrl?: string | null;
  demoUrl?: string | null;
  repositoryUrl?: string | null;
  logoUrl?: string | null;
  coverImageUrl?: string | null;
};

type EditableProject = {
  id?: string;
  name?: string | null;
  description?: string | null;
  role?: string | null;
  technologies?: string | null;
  categories?: string | null;
  status?: string | null;
  launchDate?: string | null;
  keyMetric?: string | null;
  websiteUrl?: string | null;
  logoUrl?: string | null;
  coverImageUrl?: string | null;
};

type EditableAchievement = {
  id?: string;
  type?: string | null;
  title?: string | null;
  organization?: string | null;
  date?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  verificationUrl?: string | null;
};

export function ProfileEditor({
  profile,
  product,
  project,
  achievement,
}: {
  profile: EditableProfile;
  product?: EditableProduct | null;
  project?: EditableProject | null;
  achievement?: EditableAchievement | null;
}) {
  const [profileState, setProfileState] = useState(profile);
  const [productState, setProductState] = useState<EditableProduct>(product ?? {});
  const [projectState, setProjectState] = useState<EditableProject>(project ?? { status: "ACTIVE" });
  const [achievementState, setAchievementState] = useState<EditableAchievement>(achievement ?? { type: "Milestone" });
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<"idle" | "checking" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(profile.avatarUrl ?? "");

  const profileUrl = useMemo(() => `/profile/${profileState.username}`, [profileState.username]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  async function checkUsername() {
    if (!profileState.username || profileState.username.length < 3) return;
    setStatus("checking");
    const response = await fetch(`/api/profile/username?username=${encodeURIComponent(profileState.username)}`);
    const body = await response.json();
    setStatus("idle");
    setMessage(body.available ? "Username available." : "Username is unavailable.");
  }

  async function save() {
    setStatus("saving");
    setMessage(null);
    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile: profileState, product: productState, project: projectState, achievement: achievementState }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Profile save failed");
      setDirty(false);
      setStatus("saved");
      setMessage("Profile saved.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Profile save failed");
    }
  }

  function markDirty() {
    setDirty(true);
    if (status === "saved") setStatus("idle");
  }

  function updateProfile(key: keyof EditableProfile, value: string) {
    markDirty();
    setProfileState((current) => ({ ...current, [key]: value }));
  }

  function updateSocial(key: "linkedin" | "github" | "x", value: string) {
    markDirty();
    setProfileState((current) => ({ ...current, socialLinks: { ...(current.socialLinks ?? {}), [key]: value } }));
  }

  function validateAvatar(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("Avatar upload must be an image file.");
      return;
    }
    if (file.size > 2_000_000) {
      setMessage("Avatar image must be under 2 MB.");
      return;
    }
    setAvatarPreview(URL.createObjectURL(file));
    setMessage("Image preview loaded. Add a persistent avatar URL before saving.");
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_380px]">
      <section className="space-y-10">
        <EditorSection title="Identity">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Full name">
              <Input value={profileState.fullName ?? ""} onChange={(event) => updateProfile("fullName", event.target.value)} />
            </Field>
            <Field label="Username">
              <div className="flex gap-2">
                <Input
                  value={profileState.username}
                  onChange={(event) => updateProfile("username", event.target.value)}
                  onBlur={checkUsername}
                />
                <Button type="button" variant="outline" onClick={checkUsername} disabled={status === "checking"}>
                  Check
                </Button>
              </div>
            </Field>
            <Field label="Headline">
              <Input value={profileState.headline ?? ""} onChange={(event) => updateProfile("headline", event.target.value)} />
            </Field>
            <Field label="Location">
              <Input value={profileState.location ?? ""} onChange={(event) => updateProfile("location", event.target.value)} />
            </Field>
            <Field label="Current status">
              <Input value={profileState.status ?? ""} onChange={(event) => updateProfile("status", event.target.value)} />
            </Field>
            <Field label="Availability">
              <Input value={profileState.availability ?? ""} onChange={(event) => updateProfile("availability", event.target.value)} />
            </Field>
          </div>
          <Field label="Bio">
            <Textarea value={profileState.bio ?? ""} onChange={(event) => updateProfile("bio", event.target.value)} />
          </Field>
        </EditorSection>

        <EditorSection title="Links and media">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Avatar URL">
              <Input value={profileState.avatarUrl ?? ""} onChange={(event) => updateProfile("avatarUrl", event.target.value)} />
            </Field>
            <Field label="Image preview upload">
              <Input type="file" accept="image/*" onChange={(event) => validateAvatar(event.target.files?.[0])} />
            </Field>
            <Field label="Website">
              <Input value={profileState.websiteUrl ?? ""} onChange={(event) => updateProfile("websiteUrl", event.target.value)} />
            </Field>
            <Field label="LinkedIn">
              <Input value={profileState.socialLinks?.linkedin ?? ""} onChange={(event) => updateSocial("linkedin", event.target.value)} />
            </Field>
            <Field label="GitHub">
              <Input value={profileState.socialLinks?.github ?? ""} onChange={(event) => updateSocial("github", event.target.value)} />
            </Field>
            <Field label="X / Twitter">
              <Input value={profileState.socialLinks?.x ?? ""} onChange={(event) => updateSocial("x", event.target.value)} />
            </Field>
          </div>
        </EditorSection>

        <EditorSection title="Privacy">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Profile visibility">
              <Select value={profileState.visibility} onChange={(event) => updateProfile("visibility", event.target.value)}>
                <option value="PUBLIC">Public</option>
                <option value="CONNECTIONS">Connections</option>
                <option value="PRIVATE">Private</option>
              </Select>
            </Field>
            <Field label="Messaging">
              <Select value={profileState.messagingPermission} onChange={(event) => updateProfile("messagingPermission", event.target.value)}>
                <option value="EVERYONE">Everyone</option>
                <option value="CONNECTIONS">Connections</option>
                <option value="NONE">None</option>
              </Select>
            </Field>
            <Field label="Connections">
              <Select value={profileState.connectionPermission} onChange={(event) => updateProfile("connectionPermission", event.target.value)}>
                <option value="EVERYONE">Everyone</option>
                <option value="CONNECTIONS">Connections</option>
                <option value="NONE">None</option>
              </Select>
            </Field>
          </div>
        </EditorSection>

        <EditorSection title="Featured product">
          <ProductFields value={productState} onChange={(value) => { markDirty(); setProductState(value); }} />
        </EditorSection>

        <EditorSection title="Featured project">
          <ProjectFields value={projectState} onChange={(value) => { markDirty(); setProjectState(value); }} />
        </EditorSection>

        <EditorSection title="Featured achievement">
          <AchievementFields value={achievementState} onChange={(value) => { markDirty(); setAchievementState(value); }} />
        </EditorSection>
      </section>

      <aside className="space-y-6">
        <div className="border-y border-border py-6">
          <p className="eyebrow mb-4">PREVIEW</p>
          <div className="flex items-start gap-4">
            {avatarPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarPreview} alt="" className="h-16 w-16 rounded-sm border border-border object-cover" />
            ) : (
              <div className="h-16 w-16 border border-border" />
            )}
            <div>
              <p className="text-lg font-semibold">{profileState.fullName || "Unnamed profile"}</p>
              <p className="mt-1 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">@{profileState.username}</p>
            </div>
          </div>
          <p className="mt-5 text-sm leading-6 text-muted-foreground">{profileState.headline || "Add a professional headline."}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Badge variant={dirty ? "warning" : "muted"}>{dirty ? "Unsaved changes" : "Saved state"}</Badge>
            <Badge variant="muted">{profileState.visibility}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={save} disabled={status === "saving"}>
            {status === "saving" ? "Saving" : "Save profile"}
          </Button>
          <Button asChild variant="outline">
            <Link href={profileUrl}>Open profile</Link>
          </Button>
        </div>
        {message ? <p className="border-y border-border py-3 text-xs leading-5 text-muted-foreground">{message}</p> : null}
      </aside>
    </div>
  );
}

function EditorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-y border-border py-6">
      <p className="eyebrow mb-5">{title}</p>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function ProductFields({ value, onChange }: { value: EditableProduct; onChange: (value: EditableProduct) => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Product name"><Input value={value.name ?? ""} onChange={(event) => onChange({ ...value, name: event.target.value })} /></Field>
      <Field label="Role"><Input value={value.role ?? ""} onChange={(event) => onChange({ ...value, role: event.target.value })} /></Field>
      <Field label="Category"><Input value={value.category ?? ""} onChange={(event) => onChange({ ...value, category: event.target.value })} /></Field>
      <Field label="Stage">
        <Select value={value.stage ?? ""} onChange={(event) => onChange({ ...value, stage: event.target.value })}>
          <option value="">Unknown</option>
          <option value="IDEA">Idea</option>
          <option value="MVP">MVP</option>
          <option value="PRIVATE_BETA">Private beta</option>
          <option value="PUBLIC_BETA">Public beta</option>
          <option value="LAUNCHED">Launched</option>
          <option value="SCALING">Scaling</option>
          <option value="ACQUIRED">Acquired</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
      </Field>
      <Field label="Team size"><Input value={value.teamSize ?? ""} onChange={(event) => onChange({ ...value, teamSize: Number(event.target.value) || null })} /></Field>
      <Field label="Funding status"><Input value={value.fundingStatus ?? ""} onChange={(event) => onChange({ ...value, fundingStatus: event.target.value })} /></Field>
      <Field label="Traction metric"><Input value={value.tractionMetric ?? ""} onChange={(event) => onChange({ ...value, tractionMetric: event.target.value })} /></Field>
      <Field label="Website URL"><Input value={value.websiteUrl ?? ""} onChange={(event) => onChange({ ...value, websiteUrl: event.target.value })} /></Field>
      <Field label="Demo URL"><Input value={value.demoUrl ?? ""} onChange={(event) => onChange({ ...value, demoUrl: event.target.value })} /></Field>
      <Field label="Repository URL"><Input value={value.repositoryUrl ?? ""} onChange={(event) => onChange({ ...value, repositoryUrl: event.target.value })} /></Field>
      <Field label="Description"><Textarea value={value.description ?? ""} onChange={(event) => onChange({ ...value, description: event.target.value })} /></Field>
    </div>
  );
}

function ProjectFields({ value, onChange }: { value: EditableProject; onChange: (value: EditableProject) => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Project name"><Input value={value.name ?? ""} onChange={(event) => onChange({ ...value, name: event.target.value })} /></Field>
      <Field label="Role"><Input value={value.role ?? ""} onChange={(event) => onChange({ ...value, role: event.target.value })} /></Field>
      <Field label="Technologies"><Input value={value.technologies ?? ""} onChange={(event) => onChange({ ...value, technologies: event.target.value })} /></Field>
      <Field label="Categories"><Input value={value.categories ?? ""} onChange={(event) => onChange({ ...value, categories: event.target.value })} /></Field>
      <Field label="Status">
        <Select value={value.status ?? "ACTIVE"} onChange={(event) => onChange({ ...value, status: event.target.value })}>
          <option value="ACTIVE">Active</option>
          <option value="COMPLETED">Completed</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
      </Field>
      <Field label="Launch date"><Input value={value.launchDate ?? ""} onChange={(event) => onChange({ ...value, launchDate: event.target.value })} /></Field>
      <Field label="Key metric"><Input value={value.keyMetric ?? ""} onChange={(event) => onChange({ ...value, keyMetric: event.target.value })} /></Field>
      <Field label="Project URL"><Input value={value.websiteUrl ?? ""} onChange={(event) => onChange({ ...value, websiteUrl: event.target.value })} /></Field>
      <Field label="Description"><Textarea value={value.description ?? ""} onChange={(event) => onChange({ ...value, description: event.target.value })} /></Field>
    </div>
  );
}

function AchievementFields({ value, onChange }: { value: EditableAchievement; onChange: (value: EditableAchievement) => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Title"><Input value={value.title ?? ""} onChange={(event) => onChange({ ...value, title: event.target.value })} /></Field>
      <Field label="Type"><Input value={value.type ?? ""} onChange={(event) => onChange({ ...value, type: event.target.value })} /></Field>
      <Field label="Organization"><Input value={value.organization ?? ""} onChange={(event) => onChange({ ...value, organization: event.target.value })} /></Field>
      <Field label="Date"><Input value={value.date ?? ""} onChange={(event) => onChange({ ...value, date: event.target.value })} /></Field>
      <Field label="Verification URL"><Input value={value.verificationUrl ?? ""} onChange={(event) => onChange({ ...value, verificationUrl: event.target.value })} /></Field>
      <Field label="Description"><Textarea value={value.description ?? ""} onChange={(event) => onChange({ ...value, description: event.target.value })} /></Field>
    </div>
  );
}
