import { Mail, Phone, UserRound } from "lucide-react";

import { SchoolLogoUploader } from "@/components/dashboard/school-logo-uploader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function PortalProfileWorkspace({
  name,
  email,
  phone,
  avatarUrl,
  roleLabel,
  returnTo,
  action
}: {
  name: string;
  email: string;
  phone?: string | null;
  avatarUrl?: string | null;
  roleLabel: string;
  returnTo: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <Card className="rounded-[28px]">
      <div className="flex flex-wrap items-center gap-5">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={`${name} profile image`}
            className="h-20 w-20 rounded-[20px] border border-[color:var(--border-soft)] bg-white object-cover"
          />
        ) : (
          <span className="flex h-20 w-20 items-center justify-center rounded-[20px] bg-[linear-gradient(135deg,var(--navy),#1d327a)] text-2xl font-bold text-white">
            {name
              .split(" ")
              .slice(0, 2)
              .map((word) => word[0])
              .join("")}
          </span>
        )}
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
            {roleLabel}
          </p>
          <h2 className="mt-1 text-3xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
            {name}
          </h2>
          <p className="mt-1 text-sm text-[color:var(--text-soft)]">
            Keep your profile image and contact details consistent across the portal.
          </p>
        </div>
      </div>

      <form action={action} className="mt-7 grid gap-6">
        <input type="hidden" name="returnTo" value={returnTo} />

        <section className="rounded-[24px] border border-[color:var(--border-soft)] bg-[linear-gradient(135deg,#fbfdff,#f8fcff)] p-5">
          <h3 className="text-lg font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
            Profile image
          </h3>
          <div className="mt-4">
            <SchoolLogoUploader
              currentLogoUrl={avatarUrl}
              schoolName={name}
              inputName="avatar"
              uploadLabel="Upload profile image"
              chooseLabel="Choose profile image"
              helperText="PNG, JPG, or WebP works best. Uploading replaces your current profile image."
            />
          </div>
        </section>

        <section className="rounded-[24px] border border-[color:var(--border-soft)] bg-white/92 p-5">
          <h3 className="text-lg font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
            Contact details
          </h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--navy)]">
                <UserRound className="h-4 w-4 text-[color:var(--green)]" />
                Full name
              </span>
              <Input name="fullName" defaultValue={name} required />
            </label>
            <label className="grid gap-2">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--navy)]">
                <Mail className="h-4 w-4 text-[color:var(--green)]" />
                Email
              </span>
              <Input value={email} readOnly />
            </label>
            <label className="grid gap-2 md:col-span-2">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--navy)]">
                <Phone className="h-4 w-4 text-[color:var(--green)]" />
                Phone number
              </span>
              <Input name="phone" defaultValue={phone ?? ""} placeholder="+64 21 000 0000" />
            </label>
          </div>
        </section>

        <div className="flex justify-end">
          <Button
            type="submit"
            className="min-h-[46px] rounded-[14px] border-[#149238] bg-[color:var(--green)] px-6 text-white hover:border-[#0f7c2e] hover:bg-[#128a30]"
          >
            Save profile
          </Button>
        </div>
      </form>
    </Card>
  );
}
