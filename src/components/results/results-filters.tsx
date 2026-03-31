"use client"

import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"

interface Route {
  id: number
  origin: string
  destination: string
}

interface Filters {
  routeId: string
  fareTab: string
  nonStopOnly: boolean
  matchesOnly: boolean
}

interface ResultsFiltersProps {
  routes: Route[]
  filters: Filters
  onChange: (filters: Filters) => void
}

export function ResultsFilters({ routes, filters, onChange }: ResultsFiltersProps) {
  function update(patch: Partial<Filters>) {
    onChange({ ...filters, ...patch })
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-2">
        <Label htmlFor="route-select">Route</Label>
        <Select
          value={filters.routeId || "all"}
          onValueChange={(value: string | null) => update({ routeId: !value || value === "all" ? "" : value })}
        >
          <SelectTrigger id="route-select" className="w-44">
            <SelectValue placeholder="All routes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All routes</SelectItem>
            {routes.map((route) => (
              <SelectItem key={route.id} value={String(route.id)}>
                {route.origin} → {route.destination}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Label htmlFor="fare-tab-select">Fare</Label>
        <Select
          value={filters.fareTab || "all"}
          onValueChange={(value: string | null) => update({ fareTab: !value || value === "all" ? "" : value })}
        >
          <SelectTrigger id="fare-tab-select" className="w-36">
            <SelectValue placeholder="All fares" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All fares</SelectItem>
            <SelectItem value="GoWild">GoWild</SelectItem>
            <SelectItem value="Dollars">Dollars</SelectItem>
            <SelectItem value="Miles">Miles</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="nonstop-switch"
          checked={filters.nonStopOnly}
          onCheckedChange={(checked) => update({ nonStopOnly: checked })}
        />
        <Label htmlFor="nonstop-switch">Nonstop only</Label>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="matches-switch"
          checked={filters.matchesOnly}
          onCheckedChange={(checked) => update({ matchesOnly: checked })}
        />
        <Label htmlFor="matches-switch">Matches only</Label>
      </div>
    </div>
  )
}
