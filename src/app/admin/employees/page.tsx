"use client";

import { useEffect, useState } from "react";
import { SkeletonRowList } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";

type Employee = {
  id: string;
  name: string;
  employeeCode: string | null;
  email: string | null;
  role: string;
  active: boolean;
  department: string | null;
  location: string | null;
  departmentId: string | null;
  locationId: string | null;
};

type Option = { id: string; name: string };

const ROLES = ["STAFF", "SUPERVISOR", "ADMIN"];

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Option[]>([]);
  const [locations, setLocations] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    role: "STAFF",
    employeeCode: "",
    pin: "",
    email: "",
    password: "",
    departmentId: "",
    locationId: "",
  });

  async function loadAll() {
    setLoading(true);
    setLoadError(false);
    try {
      const [empRes, deptRes, locRes] = await Promise.all([
        fetch("/api/admin/employees"),
        fetch("/api/admin/departments"),
        fetch("/api/admin/locations"),
      ]);
      if (!empRes.ok || !deptRes.ok || !locRes.ok) throw new Error("Request failed");
      const emp = await empRes.json();
      const dept = await deptRes.json();
      const loc = await locRes.json();
      setEmployees(emp.users ?? []);
      setDepartments(dept.departments ?? []);
      setLocations(loc.locations ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    loadAll();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm({
      name: "",
      role: "STAFF",
      employeeCode: "",
      pin: "",
      email: "",
      password: "",
      departmentId: "",
      locationId: "",
    });
    setError("");
    setShowForm(true);
  }

  function openEdit(emp: Employee) {
    setEditing(emp);
    setForm({
      name: emp.name,
      role: emp.role,
      employeeCode: emp.employeeCode ?? "",
      pin: "",
      email: emp.email ?? "",
      password: "",
      departmentId: emp.departmentId ?? "",
      locationId: emp.locationId ?? "",
    });
    setError("");
    setShowForm(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (editing) {
      const res = await fetch(`/api/admin/employees/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          departmentId: form.departmentId,
          locationId: form.locationId,
          pin: form.pin || undefined,
          password: form.password || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Could not update employee.");
        return;
      }
    } else {
      const res = await fetch("/api/admin/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Could not create employee.");
        return;
      }
    }

    setShowForm(false);
    loadAll();
  }

  async function toggleActive(emp: Employee) {
    if (emp.active) {
      await fetch(`/api/admin/employees/${emp.id}`, { method: "DELETE" });
    } else {
      await fetch(`/api/admin/employees/${emp.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: true }),
      });
    }
    loadAll();
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-3">
        <h1 className="text-2xl font-extrabold text-brand-darker tracking-tight">Employees</h1>
        <button
          onClick={openCreate}
          className="bg-brand hover:bg-brand-dark transition-colors text-white font-extrabold uppercase tracking-wide text-sm px-4 py-2.5 rounded-xl active:scale-[0.98] shrink-0"
        >
          + Add Employee
        </button>
      </div>

      <div className="bg-white rounded-2xl" style={{ boxShadow: "0 1px 2px rgba(22,19,42,0.06)" }}>
        {loading ? (
          <SkeletonRowList count={5} />
        ) : loadError ? (
          <div className="py-10 text-center">
            <p className="text-brand-darker font-medium mb-4">Something went wrong. Please try again.</p>
            <button
              onClick={loadAll}
              className="bg-brand hover:bg-brand-dark transition-colors text-white text-sm font-extrabold uppercase tracking-wide px-6 py-3 rounded-xl active:scale-[0.98]"
            >
              Try Again
            </button>
          </div>
        ) : employees.length === 0 ? (
          <EmptyState title="No employees yet" hint="Add your first employee to get started." />
        ) : (
          <>
            {/* Desktop/tablet: full table. */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left min-w-[640px]">
                <thead className="text-brand-ink2 text-xs font-bold uppercase tracking-wide border-b border-black/5">
                  <tr>
                    <th className="px-5 py-3">Name</th>
                    <th className="px-5 py-3">Role</th>
                    <th className="px-5 py-3">Login</th>
                    <th className="px-5 py-3">Department</th>
                    <th className="px-5 py-3">Location</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {employees.map((emp) => (
                    <tr key={emp.id} className={`hover:bg-brand-surface/70 transition-colors ${!emp.active ? "opacity-50" : ""}`}>
                      <td className="px-5 py-3 font-bold text-brand-darker">{emp.name}</td>
                      <td className="px-5 py-3 text-brand-ink2 font-medium">{emp.role}</td>
                      <td className="px-5 py-3 text-brand-ink2">{emp.employeeCode ?? emp.email}</td>
                      <td className="px-5 py-3 text-brand-ink2 font-medium">{emp.department ?? "—"}</td>
                      <td className="px-5 py-3 text-brand-ink2 font-medium">{emp.location ?? "—"}</td>
                      <td className="px-5 py-3">
                        {emp.active ? (
                          <span className="text-xs font-extrabold uppercase tracking-wide px-2 py-1 rounded-full bg-brand-success/10 text-brand-success">Active</span>
                        ) : (
                          <span className="text-xs font-extrabold uppercase tracking-wide px-2 py-1 rounded-full bg-brand-surface text-brand-ink2">Disabled</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right space-x-3 whitespace-nowrap">
                        <button onClick={() => openEdit(emp)} className="text-brand hover:text-brand-dark font-bold text-sm transition-colors">
                          Edit
                        </button>
                        <button onClick={() => toggleActive(emp)} className="text-brand-ink2 hover:text-brand-darker font-bold text-sm transition-colors">
                          {emp.active ? "Disable" : "Enable"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: stacked cards, same data, no horizontal scrolling. */}
            <div className="md:hidden divide-y divide-black/5">
              {employees.map((emp) => (
                <div key={emp.id} className={`p-4 ${!emp.active ? "opacity-50" : ""}`}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="font-extrabold text-brand-darker truncate">{emp.name}</p>
                    {emp.active ? (
                      <span className="shrink-0 text-[11px] font-extrabold uppercase tracking-wide px-2 py-1 rounded-full bg-brand-success/10 text-brand-success">Active</span>
                    ) : (
                      <span className="shrink-0 text-[11px] font-extrabold uppercase tracking-wide px-2 py-1 rounded-full bg-brand-surface text-brand-ink2">Disabled</span>
                    )}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm mb-3">
                    <dt className="text-brand-ink2 text-[11px] font-bold uppercase tracking-wide">Role</dt>
                    <dd className="text-brand-darker font-medium">{emp.role}</dd>
                    <dt className="text-brand-ink2 text-[11px] font-bold uppercase tracking-wide">Login</dt>
                    <dd className="text-brand-darker font-medium truncate">{emp.employeeCode ?? emp.email}</dd>
                    <dt className="text-brand-ink2 text-[11px] font-bold uppercase tracking-wide">Department</dt>
                    <dd className="text-brand-darker font-medium">{emp.department ?? "—"}</dd>
                    <dt className="text-brand-ink2 text-[11px] font-bold uppercase tracking-wide">Location</dt>
                    <dd className="text-brand-darker font-medium">{emp.location ?? "—"}</dd>
                  </dl>
                  <div className="flex gap-4">
                    <button onClick={() => openEdit(emp)} className="text-brand hover:text-brand-dark font-bold text-sm transition-colors">
                      Edit
                    </button>
                    <button onClick={() => toggleActive(emp)} className="text-brand-ink2 hover:text-brand-darker font-bold text-sm transition-colors">
                      {emp.active ? "Disable" : "Enable"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <form
            onSubmit={submit}
            className="bg-white rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
          >
            <h2 className="text-xl font-extrabold text-brand-darker tracking-tight mb-4">
              {editing ? "Edit Employee" : "Add Employee"}
            </h2>

            {error && (
              <div className="mb-3 rounded-lg bg-brand-critical/10 text-brand-critical px-3 py-2 text-sm font-medium">
                {error}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-brand-ink2 mb-1.5">Name</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg bg-brand-surface px-3 py-2.5 border-2 border-transparent focus:border-brand focus:outline-none transition-colors font-medium"
                />
              </div>

              {!editing && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-brand-ink2 mb-1.5">Role</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full rounded-lg bg-brand-surface px-3 py-2.5 border-2 border-transparent focus:border-brand focus:outline-none transition-colors font-medium"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {form.role === "STAFF" ? (
                <>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wide text-brand-ink2 mb-1.5">Employee ID</label>
                    <input
                      disabled={!!editing}
                      required={!editing}
                      value={form.employeeCode}
                      onChange={(e) => setForm({ ...form, employeeCode: e.target.value })}
                      className="w-full rounded-lg bg-brand-surface px-3 py-2.5 border-2 border-transparent disabled:opacity-60 focus:border-brand focus:outline-none transition-colors font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wide text-brand-ink2 mb-1.5">
                      PIN {editing && "(leave blank to keep unchanged)"}
                    </label>
                    <input
                      required={!editing}
                      value={form.pin}
                      onChange={(e) => setForm({ ...form, pin: e.target.value })}
                      className="w-full rounded-lg bg-brand-surface px-3 py-2.5 border-2 border-transparent focus:border-brand focus:outline-none transition-colors font-medium"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wide text-brand-ink2 mb-1.5">Email</label>
                    <input
                      disabled={!!editing}
                      required={!editing}
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="w-full rounded-lg bg-brand-surface px-3 py-2.5 border-2 border-transparent disabled:opacity-60 focus:border-brand focus:outline-none transition-colors font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wide text-brand-ink2 mb-1.5">
                      Password {editing && "(leave blank to keep unchanged)"}
                    </label>
                    <input
                      required={!editing}
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className="w-full rounded-lg bg-brand-surface px-3 py-2.5 border-2 border-transparent focus:border-brand focus:outline-none transition-colors font-medium"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-brand-ink2 mb-1.5">Department</label>
                <select
                  value={form.departmentId}
                  onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                  className="w-full rounded-lg bg-brand-surface px-3 py-2.5 border-2 border-transparent focus:border-brand focus:outline-none transition-colors font-medium"
                >
                  <option value="">—</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-brand-ink2 mb-1.5">Location</label>
                <select
                  value={form.locationId}
                  onChange={(e) => setForm({ ...form, locationId: e.target.value })}
                  className="w-full rounded-lg bg-brand-surface px-3 py-2.5 border-2 border-transparent focus:border-brand focus:outline-none transition-colors font-medium"
                >
                  <option value="">—</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 rounded-xl bg-brand-surface font-bold uppercase tracking-wide text-sm text-brand-ink2 hover:bg-brand/5 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold uppercase tracking-wide text-sm transition-colors"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
