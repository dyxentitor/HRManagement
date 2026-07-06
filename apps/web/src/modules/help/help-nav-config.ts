import { BookOpen, LifeBuoy, Mail, Rocket, ScrollText, Wrench } from "lucide-react"
import type { ComponentType } from "react"

import type { HelpCategory } from "./content/registry"

export interface HelpNavItem {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
  category?: HelpCategory
}

export const HELP_NAV_ITEMS: HelpNavItem[] = [
  { to: "/help", label: "Overview", icon: Rocket },
  {
    to: "/help/getting-started",
    label: "Getting Started",
    icon: BookOpen,
    category: "getting-started",
  },
  { to: "/help/guides", label: "Guides & Walkthroughs", icon: BookOpen, category: "guides" },
  { to: "/help/faqs", label: "FAQs", icon: LifeBuoy, category: "faqs" },
  {
    to: "/help/troubleshooting",
    label: "Troubleshooting",
    icon: Wrench,
    category: "troubleshooting",
  },
  {
    to: "/help/release-notes",
    label: "Release Notes",
    icon: ScrollText,
    category: "release-notes",
  },
  { to: "/help/contact", label: "Contact & Support", icon: Mail, category: "contact" },
]
