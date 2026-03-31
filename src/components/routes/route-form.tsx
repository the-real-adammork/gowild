"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

interface Route {
  id: number
  origin: string
  destination: string
  nonStopOnly: boolean
  allowedLayoverAirports: string
  maxLayoverMinutes: number | null
  maxPrice: number | null
  enabled: boolean
}

interface RouteFormProps {
  route?: Route
  onSave: () => void
}

export function RouteForm({ route, onSave }: RouteFormProps) {
  const [open, setOpen] = useState(false)
  const [origin, setOrigin] = useState(route?.origin ?? "")
  const [destination, setDestination] = useState(route?.destination ?? "")
  const [nonStopOnly, setNonStopOnly] = useState(route?.nonStopOnly ?? false)
  const [allowedLayoverAirports, setAllowedLayoverAirports] = useState(
    () => {
      if (!route?.allowedLayoverAirports) return ""
      try {
        const parsed = JSON.parse(route.allowedLayoverAirports)
        return Array.isArray(parsed) ? parsed.join(", ") : ""
      } catch {
        return ""
      }
    }
  )
  const [maxLayoverMinutes, setMaxLayoverMinutes] = useState(
    route?.maxLayoverMinutes?.toString() ?? ""
  )
  const [maxPrice, setMaxPrice] = useState(route?.maxPrice?.toString() ?? "")
  const [saving, setSaving] = useState(false)

  function resetForm() {
    if (!route) {
      setOrigin("")
      setDestination("")
      setNonStopOnly(false)
      setAllowedLayoverAirports("")
      setMaxLayoverMinutes("")
      setMaxPrice("")
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const airports = allowedLayoverAirports
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)

    const body = {
      origin: origin.toUpperCase(),
      destination: destination.toUpperCase(),
      nonStopOnly,
      allowedLayoverAirports: airports,
      maxLayoverMinutes: maxLayoverMinutes ? parseInt(maxLayoverMinutes) : null,
      maxPrice: maxPrice ? parseFloat(maxPrice) : null,
    }

    try {
      if (route) {
        await fetch(`/api/routes/${route.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      } else {
        await fetch("/api/routes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      }
      setOpen(false)
      resetForm()
      onSave()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={route ? "ghost" : "default"} size={route ? "sm" : "default"}>{route ? "Edit" : "Add Route"}</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{route ? "Edit Route" : "Add Route"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="origin">Origin</Label>
              <Input
                id="origin"
                value={origin}
                onChange={(e) => setOrigin(e.target.value.slice(0, 3))}
                placeholder="JFK"
                maxLength={3}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="destination">Destination</Label>
              <Input
                id="destination"
                value={destination}
                onChange={(e) => setDestination(e.target.value.slice(0, 3))}
                placeholder="LAX"
                maxLength={3}
                required
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="nonStopOnly">Nonstop Only</Label>
            <Switch
              id="nonStopOnly"
              checked={nonStopOnly}
              onCheckedChange={setNonStopOnly}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="allowedLayoverAirports">
              Allowed Layover Airports
            </Label>
            <Input
              id="allowedLayoverAirports"
              value={allowedLayoverAirports}
              onChange={(e) => setAllowedLayoverAirports(e.target.value)}
              placeholder="ORD, DFW, ATL"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="maxLayoverMinutes">Max Layover (min)</Label>
              <Input
                id="maxLayoverMinutes"
                type="number"
                value={maxLayoverMinutes}
                onChange={(e) => setMaxLayoverMinutes(e.target.value)}
                placeholder="120"
                min={0}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="maxPrice">Max Price ($)</Label>
              <Input
                id="maxPrice"
                type="number"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="500"
                min={0}
                step="0.01"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
