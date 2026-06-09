import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Region } from "@/lib/domain/types";

export function AmbassadorSignupForm({
  regions,
  action
}: {
  regions: Region[];
  action: (formData: FormData) => void;
}) {
  return (
    <form action={action}>
      <Card className="rounded-[34px]">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
          Application form
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
          Tell us about your presentation experience.
        </h2>
        <p className="mt-3 text-sm leading-7 text-[color:var(--text-soft)]">
          We’re looking for confident presenters who can connect with students and represent
          NZ Esports professionally in schools.
        </p>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <Field label="Full name">
            <Input name="fullName" placeholder="Alex Tane" required />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" placeholder="alex@example.com" required />
          </Field>
          <Field label="Phone">
            <Input name="phone" placeholder="+64 21 000 0000" required />
          </Field>
          <Field label="Primary region">
            <Select name="regionSlug" required>
              {regions.map((region) => (
                <option key={region.id} value={region.slug}>
                  {region.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="mt-5">
          <Field label="Presentation or facilitation experience">
            <Textarea
              name="experience"
              placeholder="Tell us about presenting, youth work, education, gaming, events, or public speaking experience."
              required
            />
          </Field>
        </div>

        <label className="mt-5 flex items-start gap-3 rounded-[22px] border border-[color:var(--border-soft)] bg-[linear-gradient(135deg,#f7fbff,#f7fdf8)] px-4 py-4 text-sm text-[color:var(--text-soft)]">
          <input type="checkbox" name="openToTravel" className="mt-1" />
          I’m open to travel or temporary availability outside my main region.
        </label>

        <div className="mt-5">
          <Field label="Travel regions">
            <Input
              name="travelRegions"
              placeholder="Example: Auckland Central, West Auckland"
            />
          </Field>
        </div>

        <div className="mt-8">
          <Button type="submit">Submit ambassador application</Button>
        </div>
      </Card>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
        {label}
      </span>
      {children}
    </label>
  );
}
