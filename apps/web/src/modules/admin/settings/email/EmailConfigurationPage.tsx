import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom"

import { PageHeader } from "@/components/shell/PageHeader"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useCan } from "@/lib/perm"

const STORAGE_KEY = "email-settings-tab"
type EmailTab = "server" | "templates" | "routing"

function currentTab(pathname: string): EmailTab {
  if (pathname.endsWith("/templates")) return "templates"
  if (pathname.endsWith("/routing")) return "routing"
  return "server"
}

export function EmailTabIndexRedirect() {
  const stored = localStorage.getItem(STORAGE_KEY)
  const tab: EmailTab = stored === "templates" || stored === "routing" ? stored : "server"
  return <Navigate to={`/admin/settings/email/${tab}`} replace />
}

export default function EmailConfigurationPage() {
  const canRead = useCan("org:email_config:read")
  const location = useLocation()
  const navigate = useNavigate()
  const tab = currentTab(location.pathname)

  if (!canRead) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Email Configuration" />
        <p className="text-text-secondary">You don't have permission to view email settings.</p>
      </div>
    )
  }

  function onValueChange(value: string) {
    localStorage.setItem(STORAGE_KEY, value)
    navigate(`/admin/settings/email/${value}`)
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Email Configuration"
        subtitle="SMTP server, email templates, and notification routing for your organization."
      />
      <Tabs value={tab} onValueChange={onValueChange}>
        <TabsList>
          <TabsTrigger value="server">Email Server Configuration</TabsTrigger>
          <TabsTrigger value="templates">Email Templates</TabsTrigger>
          <TabsTrigger value="routing">Notification Routing</TabsTrigger>
        </TabsList>
      </Tabs>
      <Outlet />
    </div>
  )
}
