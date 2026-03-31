import { SearchConfigForm } from '@/components/settings/search-config-form'
import { ScrapeHistory } from '@/components/settings/scrape-history'

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
      <SearchConfigForm />
      <ScrapeHistory />
    </div>
  )
}
