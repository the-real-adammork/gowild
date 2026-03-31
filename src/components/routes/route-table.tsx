"use client"

import { useEffect, useState, useCallback } from "react"
import { Trash2 } from "lucide-react"
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { RouteForm } from "@/components/routes/route-form"

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

function parseLayoverAirports(raw: string): string {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.join(", ")
    }
    return "—"
  } catch {
    return raw || "—"
  }
}

export function RouteTable() {
  const [routes, setRoutes] = useState<Route[]>([])
  const [loading, setLoading] = useState(true)

  const fetchRoutes = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/routes")
      const data = await res.json()
      setRoutes(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRoutes()
  }, [fetchRoutes])

  async function toggleEnabled(route: Route) {
    await fetch(`/api/routes/${route.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !route.enabled }),
    })
    fetchRoutes()
  }

  async function deleteRoute(route: Route) {
    if (!confirm(`Delete route ${route.origin} → ${route.destination}?`)) return
    await fetch(`/api/routes/${route.id}`, { method: "DELETE" })
    fetchRoutes()
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Routes</h1>
        <RouteForm onSave={fetchRoutes} />
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading routes...</p>
      ) : routes.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No routes yet. Add one to get started.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Origin</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Nonstop Only</TableHead>
              <TableHead>Max Price</TableHead>
              <TableHead>Layover Airports</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {routes.map((route) => (
              <TableRow key={route.id}>
                <TableCell className="font-mono font-medium">
                  {route.origin}
                </TableCell>
                <TableCell className="font-mono font-medium">
                  {route.destination}
                </TableCell>
                <TableCell>{route.nonStopOnly ? "Yes" : "No"}</TableCell>
                <TableCell>
                  {route.maxPrice != null ? `$${route.maxPrice}` : "—"}
                </TableCell>
                <TableCell>
                  {parseLayoverAirports(route.allowedLayoverAirports)}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={route.enabled}
                    onCheckedChange={() => toggleEnabled(route)}
                    size="sm"
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <RouteForm
                      route={route}
                      onSave={fetchRoutes}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteRoute(route)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
