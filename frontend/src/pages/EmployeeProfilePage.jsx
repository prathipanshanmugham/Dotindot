import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import api, { formatINR, apiError } from "@/lib/api";
import { RoleBadge, ProjectStatusBadge, labelize } from "@/components/Badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LocationFields } from "@/components/LocationFields";
import {
  Mail, Phone, MapPin, CalendarDays, Building2, Pencil, FolderKanban,
  IndianRupee, CheckCircle2, GraduationCap, Plus, Trash2, Boxes,
} from "lucide-react";

const initials = (name) => (name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

const statusStyles = {
  assigned: "bg-gray-100 text-gray-600 border-gray-200",
  in_progress: "bg-orange-50 text-orange-700 border-orange-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const PerfCard = ({ icon: Icon, label, value, sub, testid }) => (
  <Card className="border-gray-200/80 shadow-sm" data-testid={testid}>
    <CardContent className="p-4 flex items-center gap-3">
      <div className="h-9 w-9 rounded-xl bg-[#FFF7ED] flex items-center justify-center shrink-0">
        <Icon style={{ height: 18, width: 18 }} className="text-[#F26B21]" />
      </div>
      <div>
        <div className="text-lg font-bold text-gray-900">{value}</div>
        <div className="text-xs text-gray-500">{label}{sub && <span className="text-gray-400"> · {sub}</span>}</div>
      </div>
    </CardContent>
  </Card>
);

export default function EmployeeProfilePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState({});
  const [assignForm, setAssignForm] = useState({ course_id: "", due_date: "" });

  const canManageTraining = ["super_admin", "admin", "pm"].includes(user?.role);
  const isSelf = user?.id === id;
  const canEdit = ["super_admin", "admin"].includes(user?.role) || isSelf;

  const load = useCallback(() => {
    api.get(`/employees/${id}`)
      .then((r) => { setData(r.data); setError(null); })
      .catch((e) => setError(apiError(e)));
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (canManageTraining) api.get("/training/courses").then((r) => setCourses(r.data)).catch(() => {});
  }, [canManageTraining]);

  if (error)
    return (
      <div className="text-center py-20" data-testid="profile-error">
        <p className="text-sm text-gray-500">{error}</p>
        <Link to="/employees" className="text-sm font-semibold text-[#F26B21] mt-2 inline-block">Back to directory</Link>
      </div>
    );
  if (!data)
    return <div className="h-64 flex items-center justify-center"><div className="h-7 w-7 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div>;

  const { user: emp, projects, training, performance: perf, assets = [] } = data;

  const openEdit = () => {
    setForm({
      name: emp.name || "", designation: emp.designation || "", department: emp.department || "",
      city: emp.city || "", state: emp.state || "", country: emp.country || "India", phone: emp.phone || "", join_date: emp.join_date || "",
      bio: emp.bio || "", skills: (emp.skills || []).join(", "),
    });
    setEditOpen(true);
  };

  const saveProfile = async () => {
    try {
      const body = { ...form, skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean) };
      await api.put(`/employees/${id}/profile`, body);
      toast.success("Profile updated");
      setEditOpen(false);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const assignCourse = async () => {
    if (!assignForm.course_id) return toast.error("Pick a course");
    try {
      await api.post("/training/assignments", { user_id: id, course_id: assignForm.course_id, due_date: assignForm.due_date || null });
      toast.success("Course assigned");
      setAssignOpen(false);
      setAssignForm({ course_id: "", due_date: "" });
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const setProgress = async (aid, progress) => {
    try {
      await api.put(`/training/assignments/${aid}`, { progress });
      toast.success(progress >= 100 ? "Course completed" : `Progress updated to ${progress}%`);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const removeAssignment = async (aid) => {
    try {
      await api.delete(`/training/assignments/${aid}`);
      toast.success("Assignment removed");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const trainingPct = perf.training_total ? Math.round((perf.training_completed / perf.training_total) * 100) : 0;

  return (
    <div className="space-y-6 max-w-6xl" data-testid="employee-profile-page">
      {/* Header */}
      <Card className="border-gray-200/80 shadow-sm">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-[#F26B21] to-[#FBA834] text-white font-extrabold flex items-center justify-center text-xl">
                {initials(emp.name)}
              </div>
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl font-bold tracking-tight text-gray-900" data-testid="profile-name">{emp.name}</h1>
                  <RoleBadge role={emp.role} />
                  {emp.is_active === false && <Badge variant="outline" className="bg-gray-100 text-gray-500">Inactive</Badge>}
                </div>
                <p className="text-sm text-gray-500 mt-0.5">{emp.designation || "—"}{emp.department ? ` · ${emp.department}` : ""}</p>
                {emp.bio && <p className="text-sm text-gray-400 mt-2 max-w-xl">{emp.bio}</p>}
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-gray-500">
                  <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-gray-400" />{emp.email}</span>
                  {emp.phone && <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-gray-400" />{emp.phone}</span>}
                  {emp.city && <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-gray-400" />{emp.city}</span>}
                  {emp.join_date && <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-gray-400" />Joined {emp.join_date}</span>}
                  {emp.department && <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-gray-400" />{emp.department}</span>}
                </div>
                {emp.skills?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {emp.skills.map((s) => (
                      <span key={s} className="text-[10px] font-medium bg-[#FFF7ED] text-[#F26B21] rounded-full px-2 py-0.5">{s}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {canEdit && (
              <Button variant="outline" size="sm" onClick={openEdit} data-testid="edit-profile-btn">
                <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit profile
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Performance */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <PerfCard icon={FolderKanban} label="Projects" value={perf.projects_total} sub={`${perf.projects_active} active`} testid="perf-projects" />
        <PerfCard icon={IndianRupee} label="Assigned budgets" value={formatINR(perf.total_budget)} testid="perf-budget" />
        <PerfCard icon={CheckCircle2} label="Deliverables done" value={`${perf.deliverables_done}/${perf.deliverables_total}`} testid="perf-deliverables" />
        <PerfCard icon={GraduationCap} label="Training" value={`${trainingPct}%`} sub={`${perf.training_completed}/${perf.training_total} done`} testid="perf-training" />
      </div>

      <Tabs defaultValue="projects">
        <TabsList>
          <TabsTrigger value="projects" data-testid="tab-projects">Projects</TabsTrigger>
          <TabsTrigger value="training" data-testid="tab-training">Training</TabsTrigger>
          <TabsTrigger value="assets" data-testid="tab-assets">Assets{assets.length > 0 ? ` (${assets.length})` : ""}</TabsTrigger>
        </TabsList>

        <TabsContent value="projects" className="mt-4">
          <Card className="border-gray-200/80 shadow-sm">
            <CardContent className="p-0 divide-y divide-gray-100">
              {projects.length === 0 && <div className="p-6 text-sm text-gray-400 text-center">No projects assigned yet.</div>}
              {projects.map((p) => (
                <Link key={p.id} to={`/projects/${p.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 hover:bg-orange-50/50 transition-colors" data-testid={`profile-project-${p.id}`}>
                  <div>
                    <div className="text-sm font-semibold text-gray-800">{p.name}</div>
                    <div className="text-xs text-gray-400">{p.client_name}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-gray-600">{formatINR(p.budget)}</span>
                    <ProjectStatusBadge status={p.status} />
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="training" className="mt-4 space-y-4">
          {canManageTraining && (
            <div className="flex justify-end">
              <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-[#F26B21] hover:bg-[#d95b16] text-white" data-testid="assign-course-btn">
                    <Plus className="h-3.5 w-3.5 mr-1.5" /> Assign course
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Assign a training course</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Course</Label>
                      <Select value={assignForm.course_id} onValueChange={(v) => setAssignForm((f) => ({ ...f, course_id: v }))}>
                        <SelectTrigger className="mt-1" data-testid="assign-course-select"><SelectValue placeholder="Choose a course" /></SelectTrigger>
                        <SelectContent>
                          {courses.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.title} · {c.duration_hours}h</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Due date (optional)</Label>
                      <Input type="date" className="mt-1" value={assignForm.due_date} onChange={(e) => setAssignForm((f) => ({ ...f, due_date: e.target.value }))} data-testid="assign-due-date" />
                    </div>
                    <Button className="w-full bg-[#F26B21] hover:bg-[#d95b16] text-white" onClick={assignCourse} data-testid="assign-course-submit">Assign</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}
          {training.length === 0 && (
            <Card className="border-gray-200/80 shadow-sm"><CardContent className="p-6 text-sm text-gray-400 text-center">No training assigned yet.</CardContent></Card>
          )}
          {training.map((t) => (
            <Card key={t.id} className="border-gray-200/80 shadow-sm" data-testid={`training-card-${t.id}`}>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-800">{t.course?.title || "Course"}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {t.course?.provider} · {t.course?.category} · {t.course?.duration_hours}h
                      {t.due_date && <span> · Due {t.due_date}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`${statusStyles[t.status] || ""} font-medium`} data-testid={`training-status-${t.id}`}>
                      {labelize(t.status)}
                    </Badge>
                    {canManageTraining && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-red-600" onClick={() => removeAssignment(t.id)} data-testid={`remove-training-${t.id}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <Progress value={t.progress} className="h-2 flex-1" />
                  <span className="text-xs font-semibold text-gray-600 w-9 text-right">{t.progress}%</span>
                </div>
                {(canManageTraining || isSelf) && t.status !== "completed" && (
                  <div className="mt-3 flex gap-2">
                    {[25, 50, 75].map((p) => (
                      <Button key={p} variant="outline" size="sm" className="h-7 text-xs" onClick={() => setProgress(t.id, p)} data-testid={`progress-${p}-${t.id}`}>
                        {p}%
                      </Button>
                    ))}
                    <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setProgress(t.id, 100)} data-testid={`progress-complete-${t.id}`}>
                      Mark complete
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
        <TabsContent value="assets" className="mt-4">
          <Card className="border-gray-200/80 shadow-sm">
            <CardContent className="p-0 divide-y divide-gray-100" data-testid="profile-assets-list">
              {assets.length === 0 && <div className="p-6 text-sm text-gray-400 text-center">No company assets assigned.</div>}
              {assets.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5" data-testid={`profile-asset-${a.id}`}>
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-[#FFF7ED] flex items-center justify-center shrink-0">
                      <Boxes style={{ height: 16, width: 16 }} className="text-[#F26B21]" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-800">{a.name} <span className="text-xs font-normal text-gray-400 ml-1">{a.code}</span></div>
                      <div className="text-xs text-gray-400">
                        {labelize(a.asset_type)}{a.serial_no ? ` · SN ${a.serial_no}` : ""}{a.since ? ` · held since ${a.since}` : ""}
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className={a.status === "assigned" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-600 border-gray-200"}>
                    {labelize(a.status)}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit profile dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit profile</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {["super_admin", "admin"].includes(user?.role) && (
              <div className="col-span-2">
                <Label>Name</Label>
                <Input className="mt-1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} data-testid="profile-edit-name" />
              </div>
            )}
            <div>
              <Label>Designation</Label>
              <Input className="mt-1" value={form.designation} onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))} data-testid="profile-edit-designation" />
            </div>
            <div>
              <Label>Department</Label>
              <Input className="mt-1" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} />
            </div>
            <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <LocationFields country={form.country || "India"} state={form.state} city={form.city} prefix="profile-edit" compact
                onChange={(v) => setForm((f) => ({ ...f, country: v.country, state: v.state, city: v.city }))} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input className="mt-1" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <Label>Join date</Label>
              <Input type="date" className="mt-1" value={form.join_date} onChange={(e) => setForm((f) => ({ ...f, join_date: e.target.value }))} />
            </div>
            <div>
              <Label>Skills (comma separated)</Label>
              <Input className="mt-1" value={form.skills} onChange={(e) => setForm((f) => ({ ...f, skills: e.target.value }))} data-testid="profile-edit-skills" />
            </div>
            <div className="col-span-2">
              <Label>Bio</Label>
              <Textarea className="mt-1" rows={2} value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} />
            </div>
          </div>
          <Button className="w-full bg-[#F26B21] hover:bg-[#d95b16] text-white" onClick={saveProfile} data-testid="profile-edit-save">Save changes</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
