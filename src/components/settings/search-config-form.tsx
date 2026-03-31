"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

type FareTab = "GoWild" | "Dollars" | "Miles"

const FARE_TAB_OPTIONS: FareTab[] = ["GoWild", "Dollars", "Miles"]

interface SearchConfig {
  searchDaysOut: number
  searchIncludeToday: boolean
  fareTabs: FareTab[]
  emailTo: string
  emailEnabled: boolean
  cronBaseHours: number[]
  cronJitterMinutes: number
}

const DEFAULT_CONFIG: SearchConfig = {
  searchDaysOut: 7,
  searchIncludeToday: true,
  fareTabs: ["GoWild"],
  emailTo: "",
  emailEnabled: true,
  cronBaseHours: [7, 11, 15, 21],
  cronJitterMinutes: 30,
}

export function SearchConfigForm() {
  const [config, setConfig] = useState<SearchConfig>(DEFAULT_CONFIG)
  const [cronBaseHoursText, setCronBaseHoursText] = useState("7,11,15,21")
  const [isSaving, setIsSaving] = useState(false)
  const [isScraping, setIsScraping] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (!data) return
        const fareTabs: FareTab[] = (() => {
          try {
            return typeof data.fareTabs === "string"
              ? JSON.parse(data.fareTabs)
              : data.fareTabs ?? ["GoWild"]
          } catch {
            return ["GoWild"]
          }
        })()
        const cronBaseHours: number[] = (() => {
          try {
            return typeof data.cronBaseHours === "string"
              ? JSON.parse(data.cronBaseHours)
              : data.cronBaseHours ?? [7, 11, 15, 21]
          } catch {
            return [7, 11, 15, 21]
          }
        })()
        setConfig({
          searchDaysOut: data.searchDaysOut ?? 7,
          searchIncludeToday: data.searchIncludeToday ?? true,
          fareTabs,
          emailTo: data.emailTo ?? "",
          emailEnabled: data.emailEnabled ?? true,
          cronBaseHours,
          cronJitterMinutes: data.cronJitterMinutes ?? 30,
        })
        setCronBaseHoursText(cronBaseHours.join(","))
      })
      .catch(() => {})
  }, [])

  function toggleFareTab(tab: FareTab) {
    setConfig((prev) => {
      const exists = prev.fareTabs.includes(tab)
      const next = exists
        ? prev.fareTabs.filter((t) => t !== tab)
        : [...prev.fareTabs, tab]
      return { ...prev, fareTabs: next.length > 0 ? next : [tab] }
    })
  }

  function handleCronBaseHoursChange(value: string) {
    setCronBaseHoursText(value)
    const parsed = value
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n >= 0 && n <= 23)
    if (parsed.length > 0) {
      setConfig((prev) => ({ ...prev, cronBaseHours: parsed }))
    }
  }

  async function handleSave() {
    setIsSaving(true)
    setSaveMessage(null)
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      })
      if (res.ok) {
        setSaveMessage("Settings saved.")
      } else {
        setSaveMessage("Failed to save settings.")
      }
    } catch {
      setSaveMessage("Failed to save settings.")
    } finally {
      setIsSaving(false)
      setTimeout(() => setSaveMessage(null), 3000)
    }
  }

  async function handleScrapeNow() {
    setIsScraping(true)
    setSaveMessage(null)
    try {
      const res = await fetch("/api/scrape", { method: "POST" })
      if (res.ok) {
        setSaveMessage("Scrape started.")
      } else {
        const data = await res.json().catch(() => ({}))
        setSaveMessage(data?.error ?? "Failed to start scrape.")
      }
    } catch {
      setSaveMessage("Failed to start scrape.")
    } finally {
      setIsScraping(false)
      setTimeout(() => setSaveMessage(null), 3000)
    }
  }

  return (
    <div className="space-y-4">
      {/* Search Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Search Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="searchDaysOut">Days Out (1–14)</Label>
            <Input
              id="searchDaysOut"
              type="number"
              min={1}
              max={14}
              value={config.searchDaysOut}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  searchDaysOut: Math.min(14, Math.max(1, parseInt(e.target.value, 10) || 1)),
                }))
              }
              className="w-32"
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch
              checked={config.searchIncludeToday}
              onCheckedChange={(checked) =>
                setConfig((prev) => ({ ...prev, searchIncludeToday: checked }))
              }
              id="searchIncludeToday"
            />
            <Label htmlFor="searchIncludeToday">Include Today</Label>
          </div>

          <div className="grid gap-2">
            <Label>Fare Tabs</Label>
            <div className="flex gap-2 flex-wrap">
              {FARE_TAB_OPTIONS.map((tab) => {
                const active = config.fareTabs.includes(tab)
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => toggleFareTab(tab)}
                    className={[
                      "rounded-lg border px-3 py-1 text-sm font-medium transition-colors outline-none",
                      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:bg-muted",
                    ].join(" ")}
                  >
                    {tab}
                  </button>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Schedule */}
      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="cronBaseHours">Base Scrape Hours (comma-separated, 0–23)</Label>
            <Input
              id="cronBaseHours"
              type="text"
              value={cronBaseHoursText}
              onChange={(e) => handleCronBaseHoursChange(e.target.value)}
              placeholder="7,11,15,21"
              className="w-64"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="cronJitterMinutes">Jitter Range (minutes, 0–60)</Label>
            <Input
              id="cronJitterMinutes"
              type="number"
              min={0}
              max={60}
              value={config.cronJitterMinutes}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  cronJitterMinutes: Math.min(60, Math.max(0, parseInt(e.target.value, 10) || 0)),
                }))
              }
              className="w-32"
            />
          </div>
        </CardContent>
      </Card>

      {/* Email Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>Email Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="emailTo">Email Address</Label>
            <Input
              id="emailTo"
              type="email"
              value={config.emailTo}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, emailTo: e.target.value }))
              }
              placeholder="you@example.com"
              className="w-72"
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch
              checked={config.emailEnabled}
              onCheckedChange={(checked) =>
                setConfig((prev) => ({ ...prev, emailEnabled: checked }))
              }
              id="emailEnabled"
            />
            <Label htmlFor="emailEnabled">Enable Email Notifications</Label>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving…" : "Save Settings"}
        </Button>
        <Button variant="outline" onClick={handleScrapeNow} disabled={isScraping}>
          {isScraping ? "Starting…" : "Scrape Now"}
        </Button>
        {saveMessage && (
          <span className="text-sm text-muted-foreground">{saveMessage}</span>
        )}
      </div>
    </div>
  )
}
