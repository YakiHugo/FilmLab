import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FilmProfile } from "@/types";

interface EditorFilmProfilePickerProps {
  profiles: FilmProfile[];
  selectedProfileId?: string;
  disabled?: boolean;
  onSelect: (profileId: string | undefined) => void;
}

const toSearchText = (profile: FilmProfile) =>
  [profile.name, profile.description ?? "", ...(profile.tags ?? [])].join(" ").toLowerCase();

export function EditorFilmProfilePicker({
  profiles,
  selectedProfileId,
  disabled = false,
  onSelect,
}: EditorFilmProfilePickerProps) {
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string>("all");

  const tags = useMemo(() => {
    const collected = new Set<string>();
    profiles.forEach((profile) => {
      (profile.tags ?? []).forEach((tag) => collected.add(tag));
    });
    return ["all", ...Array.from(collected).sort((a, b) => a.localeCompare(b))];
  }, [profiles]);

  const filteredProfiles = useMemo(() => {
    const search = query.trim().toLowerCase();
    return profiles.filter((profile) => {
      if (activeTag !== "all" && !(profile.tags ?? []).includes(activeTag)) {
        return false;
      }
      if (!search) {
        return true;
      }
      return toSearchText(profile).includes(search);
    });
  }, [activeTag, profiles, query]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-slate-500" />
        <input
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Search film profile..."
          disabled={disabled}
          className="h-8 w-full rounded-md border border-white/10 bg-[#0f1114]/70 pl-7 pr-2 text-xs text-slate-100 placeholder:text-slate-500"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => {
          const active = tag === activeTag;
          return (
            <button
              key={tag}
              type="button"
              disabled={disabled}
              onClick={() => setActiveTag(tag)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] transition",
                active
                  ? "border-white/35 bg-white/10 text-white"
                  : "border-white/10 bg-[#0f1114]/50 text-slate-400 hover:border-white/20 hover:text-slate-300"
              )}
            >
              {tag === "all" ? "All" : tag}
            </button>
          );
        })}
      </div>

      <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
        <motion.button
          type="button"
          layout
          disabled={disabled}
          whileHover={{ y: disabled ? 0 : -1 }}
          whileTap={{ scale: disabled ? 1 : 0.99 }}
          className={cn(
            "rounded-xl border p-2 text-left transition",
            !selectedProfileId
              ? "border-white/35 bg-white/10 text-white"
              : "border-white/10 bg-[#0f1114]/70 text-slate-200 hover:border-white/20"
          )}
          onClick={() => onSelect(undefined)}
        >
          <p className="text-xs font-medium">Auto</p>
          <p className="mt-1 line-clamp-2 text-[11px] text-slate-400">
            Follow selected preset profile or runtime generated profile.
          </p>
        </motion.button>

        {filteredProfiles.map((profile, index) => {
          const selected = profile.id === selectedProfileId;
          return (
            <motion.button
              key={profile.id}
              type="button"
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: index * 0.01 }}
              whileHover={{ y: disabled ? 0 : -1 }}
              whileTap={{ scale: disabled ? 1 : 0.99 }}
              disabled={disabled}
              className={cn(
                "rounded-xl border p-2 text-left transition",
                selected
                  ? "border-white/35 bg-white/10 text-white"
                  : "border-white/10 bg-[#0f1114]/70 text-slate-200 hover:border-white/20"
              )}
              onClick={() => onSelect(profile.id)}
            >
              <div className="mb-2 h-12 w-full rounded-md bg-[radial-gradient(circle_at_12%_18%,rgba(250,204,21,0.22),transparent_44%),radial-gradient(circle_at_82%_78%,rgba(249,115,22,0.2),transparent_48%),linear-gradient(145deg,rgba(18,18,20,0.9),rgba(10,10,12,0.92))]" />
              <p className="line-clamp-1 text-xs font-medium">{profile.name}</p>
              {profile.description && (
                <p className="mt-1 line-clamp-2 text-[11px] text-slate-400">{profile.description}</p>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}


