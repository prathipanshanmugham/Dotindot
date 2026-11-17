import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api, { formatINR, apiError, daysUntil } from "@/lib/api";
import { Missing, Pill, fmtDate } from "@/components/kit";
import { rupees } from "@/lib/revenue";
import { BillingCell } from "@/components/ProjectBilling";
import { ClientStatusBadge, HealthBadge, ProjectStatusBadge, labelize } from "@/components/Badges";
import ClientFormDialog from "@/components/ClientFormDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, ExternalLink, Pencil, Trash2, Eye, EyeOff, Copy, MapPin, Plus, LayoutDashboard, Phone, Mail, User, Repeat, Receipt, FileText } from "lucide-react";
import { toast } from "sonner";

const CredentialRow = ({ clientId, cred, canReveal, onDeleted, canManage }) => {
  const [secret, setSecret] = useState(null);

  const reveal = async () => {
    if (secret !== null) {
      setSecret(null);
      return;
    }
    try {
      const { data } = await api.get(`/clients/${clientId}/credentials/${cred.id}/reveal`);
      setSecret(data.secret);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 gap-3" data-testid={`credential-row-${cred.id}`}>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-gray-800">{cred.label}</div>
        <div className="text-xs text-gray-500">User: <span className="font-mono">{cred.username}</span></div>
      </div>
      <div className="flex items-center gap-2">
        <code className="text-sm bg-gray-50 border border-gray-200 rounded px-2.5 py-1 font-mono" data-testid={`credential-secret-${cred.id}`}>
          {secret !== null ? secret : "••••••••••"}
        </code>
        {secret !== null && (
          <Button variant="ghost" size="icon" onClick={() => { navigator.clipboard.writeText(secret); toast.success("Copied"); }} data-testid={`copy-credential-${cred.id}`}>
            <Copy className="h-4 w-4 text-gray-500" />
          </Button>
        )}
        {canReveal && (
          <Button variant="outline" size="sm" onClick={reveal} data-testid={`reveal-credential-btn-${cred.id}`}>
            {secret !== null ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        )}
        {canManage && (
          <Button variant="ghost" size="icon" onClick={onDeleted} data-testid={`delete-credential-${cred.id}`}>
            <Trash2 className="h-4 w-4 text-gray-400" />
          </Button>
        )}
      </div>
    </div>
  );
};

export default function ClientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, hasPerm } = useAuth();
  const [client, setClient] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [newCred, setNewCred] = useState({ label: "", username: "", secret: "" });
  const [showCredForm, setShowCredForm] = useState(false);
  const [rollup, setRollup] = useState(null);
  const [docs, setDocs] = useState(null);
  const canBilling = hasPerm("billing");

  const canWrite = ["super_admin", "admin", "pm", "sales"].includes(user.role);
  const canReveal = ["super_admin", "admin", "pm"].includes(user.role);
  const canDelete = ["super_admin", "admin", "pm"].includes(user.role);

  const load = useCallback(() => {
    api.get(`/clients/${id}`).then((res) => setClient(res.data)).catch((e) => { setLoadErr(apiError(e)); toast.error(apiError(e)); });
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get(`/clients/${id}/growth-rollup`).then((r) => setRollup(r.data)).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (canBilling) api.get("/billing/docs", { params: { client_id: id } }).then((r) => setDocs(r.data)).catch(() => setDocs([]));
  }, [id, canBilling]);

  if (!client)
    return loadErr ? <Missing error={loadErr} back="/clients" backLabel="Back to clients" /> : <div className="h-64 flex items-center justify-center"><div className="h-7 w-7 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div>;

  const rev = client.revenue || {};
  const projects = client.projects || [];
  const recurringProjects = projects.filter((p) => p.billing_type === "recurring");
  const oneTimeProjects = projects.filter((p) => p.billing_type !== "recurring");
  const openCount = projects.filter((p) => ["kickoff", "in_progress", "review"].includes(p.status)).length;

  const deleteClient = async () => {
    try {
      await api.delete(`/clients/${id}`);
      toast.success("Client deleted");
      navigate("/clients");
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const addCredential = async () => {
    if (!newCred.label || !newCred.username) {
      toast.error("Label and username required");
      return;
    }
    try {
      await api.post(`/clients/${id}/credentials`, newCred);
      toast.success("Credential added");
      setNewCred({ label: "", username: "", secret: "" });
      setShowCredForm(false);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const deleteCredential = async (credId) => {
    try {
      await api.delete(`/clients/${id}/credentials/${credId}`);
      toast.success("Credential removed");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div className="space-y-6 max-w-6xl" data-testid="client-detail-page">
      <button onClick={() => navigate("/clients")} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#F26B21] transition-colors" data-testid="back-to-clients">
        <ArrowLeft className="h-4 w-4" /> Back to clients
      </button>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900" data-testid="client-name-heading">{client.name}</h1>
            <HealthBadge health={client.health} />
            <ClientStatusBadge status={client.status} />
            {client.recurring && <Pill tone="orange"><Repeat className="h-3 w-3" />Retainer · {rupees(rev.mrr)}/mo</Pill>}
          </div>
          <p className="text-sm text-gray-500 mt-1.5 flex items-center gap-x-3 gap-y-1 flex-wrap" data-testid="client-contact-line">
            {client.contact_name ? <span className="inline-flex items-center gap-1 text-gray-700"><User className="h-3.5 w-3.5" />{client.contact_name}</span> : <span className="text-gray-400">No main contact yet</span>}
            {client.contact_phone && <a href={`tel:${client.contact_phone.replace(/\s+/g, "")}`} className="inline-flex items-center gap-1 hover:text-[#F26B21]"><Phone className="h-3.5 w-3.5" />{client.contact_phone}</a>}
            {client.contact_email && <a href={`mailto:${client.contact_email}`} className="inline-flex items-center gap-1 hover:text-[#F26B21] [overflow-wrap:anywhere]"><Mail className="h-3.5 w-3.5" />{client.contact_email}</a>}
            <span>{labelize(client.industry)}</span>
            {(client.city || client.state) && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{[client.city, client.state].filter(Boolean).join(", ")}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="bg-[#F26B21] hover:bg-[#d95b16] text-white" onClick={() => navigate(`/clients/${client.id}/dashboard`)} data-testid="open-client-dashboard">
            <LayoutDashboard className="h-4 w-4 mr-1.5" /> Client dashboard
          </Button>
          {client.google_drive_link && (
            <Button variant="outline" size="sm" asChild data-testid="open-drive-btn">
              <a href={client.google_drive_link} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-1.5" /> Drive
              </a>
            </Button>
          )}
          {canWrite && (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} data-testid="edit-client-btn">
              <Pencil className="h-4 w-4 mr-1.5" /> Edit
            </Button>
          )}
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" data-testid="delete-client-btn">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {client.name}?</AlertDialogTitle>
                  <AlertDialogDescription>This removes the client and all its projects. This cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={deleteClient} className="bg-red-600 hover:bg-red-700" data-testid="confirm-delete-client">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="bg-white border border-gray-200 h-auto flex-wrap justify-start">
          {["overview", "projects", ...(canBilling ? ["billing"] : []), "growth", "contacts", "contracts", "credentials", "details", "notes"].map((t) => (
            <TabsTrigger key={t} value={t} data-testid={`client-tab-${t}`} className="data-[state=active]:bg-[#FFF7ED] data-[state=active]:text-[#F26B21]">
              {labelize(t)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="client-revenue">
            <Card className="border-gray-200/80"><CardContent className="p-4 sm:p-5"><div className="text-xl sm:text-2xl font-bold font-mono" data-testid="client-mrr">{rupees(rev.mrr)}</div><div className="text-xs text-gray-500">MRR · {rupees(rev.arr)} a year</div></CardContent></Card>
            <Card className="border-gray-200/80"><CardContent className="p-4 sm:p-5"><div className="text-xl sm:text-2xl font-bold font-mono">{rupees(rev.billed)}</div><div className="text-xs text-gray-500">Invoiced so far · {rev.invoices || 0} invoice{rev.invoices === 1 ? "" : "s"}</div></CardContent></Card>
            <Card className={`border-gray-200/80 ${rev.outstanding > 0 ? "border-amber-200 bg-amber-50/40" : ""}`}><CardContent className="p-4 sm:p-5"><div className="text-xl sm:text-2xl font-bold font-mono">{rupees(rev.outstanding)}</div><div className="text-xs text-gray-500">Still to be paid</div></CardContent></Card>
            <Card className="border-gray-200/80"><CardContent className="p-4 sm:p-5"><div className="text-xl sm:text-2xl font-bold font-mono">{openCount}</div><div className="text-xs text-gray-500">Open projects · {projects.length} total</div></CardContent></Card>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-gray-200/80">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Repeat className="h-4 w-4 text-[#F26B21]" />Recurring {rev.recurring_since && <span className="text-xs font-normal text-gray-400">· since {fmtDate(rev.recurring_since, { month: "short", year: "numeric" })}</span>}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {recurringProjects.length === 0 && <p className="text-sm text-gray-400">No recurring projects. Edit a project and choose Recurring to bill it every month.</p>}
                {recurringProjects.map((p) => (
                  <Link key={p.id} to={`/projects/${p.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3.5 py-2.5 hover:border-orange-200" data-testid={`client-recurring-${p.id}`}>
                    <div className="min-w-0"><div className="text-sm font-semibold text-gray-800 truncate">{p.name}</div><ProjectStatusBadge status={p.status} /></div>
                    <div className="text-right shrink-0"><BillingCell p={p} /></div>
                  </Link>
                ))}
              </CardContent>
            </Card>
            <Card className="border-gray-200/80">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Receipt className="h-4 w-4 text-gray-400" />One-time · {rupees(rev.one_time_value)}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {oneTimeProjects.length === 0 && <p className="text-sm text-gray-400">No one-time projects.</p>}
                {oneTimeProjects.slice(0, 6).map((p) => (
                  <Link key={p.id} to={`/projects/${p.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3.5 py-2.5 hover:border-orange-200">
                    <div className="min-w-0"><div className="text-sm font-semibold text-gray-800 truncate">{p.name}</div><ProjectStatusBadge status={p.status} /></div>
                    <span className="font-mono text-sm text-gray-900 shrink-0">{rupees(p.budget)}</span>
                  </Link>
                ))}
                {oneTimeProjects.length > 6 && <p className="text-xs text-gray-400">+ {oneTimeProjects.length - 6} more in the Projects tab</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="projects" className="mt-4 space-y-3">
          {canWrite && <Button size="sm" variant="outline" onClick={() => navigate(`/projects/new?client=${client.id}`)} data-testid="client-new-project"><Plus className="h-3.5 w-3.5 mr-1" />New project for {client.name}</Button>}
          <Card className="border-gray-200/80 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/70"><TableHead>Project</TableHead><TableHead>Billing</TableHead><TableHead className="hidden sm:table-cell">Status</TableHead><TableHead className="hidden md:table-cell">Dates</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {projects.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-sm text-gray-400">No projects for this client yet.</TableCell></TableRow>
                ) : (
                  projects.map((p) => (
                    <TableRow key={p.id} className="cursor-pointer hover:bg-orange-50/40" onClick={() => navigate(`/projects/${p.id}`)} data-testid={`client-project-row-${p.id}`}>
                      <TableCell className="font-semibold text-gray-900">{p.name}<div className="sm:hidden mt-1"><ProjectStatusBadge status={p.status} /></div></TableCell>
                      <TableCell><BillingCell p={p} /></TableCell>
                      <TableCell className="hidden sm:table-cell"><ProjectStatusBadge status={p.status} /></TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-gray-500 whitespace-nowrap">{p.start_date ? fmtDate(p.start_date) : "—"} → {p.end_date ? fmtDate(p.end_date) : p.billing_type === "recurring" ? "ongoing" : "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {canBilling && (
          <TabsContent value="billing" className="mt-4 space-y-3" data-testid="client-billing-tab">
            {hasPerm("billing.manage") && <Button size="sm" variant="outline" onClick={() => navigate(`/finance/billing/new?type=invoice&client=${client.id}`)}><Plus className="h-3.5 w-3.5 mr-1" />New invoice</Button>}
            {!docs ? <p className="text-sm text-gray-400">Loading…</p> : docs.length === 0 ? <p className="text-sm text-gray-400">No quotations or invoices for this client yet.</p> : (
              <Card className="border-gray-200/80 overflow-hidden">
                <Table>
                  <TableHeader><TableRow className="bg-gray-50/70"><TableHead>Document</TableHead><TableHead className="hidden sm:table-cell">Date</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right hidden sm:table-cell">Balance</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {docs.map((d) => (
                      <TableRow key={d.id} className="cursor-pointer hover:bg-orange-50/40" onClick={() => navigate(`/finance/billing/${d.id}`)}>
                        <TableCell><div className="text-sm font-semibold text-gray-900 flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-gray-400" />{d.number}</div><div className="text-xs text-gray-500 truncate max-w-[220px]">{d.type_label}{d.title ? ` · ${d.title}` : ""}</div></TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-gray-500">{fmtDate(d.date)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{d.currency === "INR" ? rupees(d.total) : `${d.currency} ${Number(d.total).toLocaleString("en-IN")}`}</TableCell>
                        <TableCell className="text-right font-mono text-sm hidden sm:table-cell">{d.balance ? rupees(d.balance) : "—"}</TableCell>
                        <TableCell><Pill tone={d.status === "paid" ? "green" : d.status === "overdue" ? "red" : d.status === "draft" ? "gray" : "blue"}>{labelize(d.status)}</Pill></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>
        )}

        <TabsContent value="growth" className="mt-4 space-y-4" data-testid="client-growth-tab">
          {!rollup ? (
            <p className="text-sm text-gray-400">Loading growth data…</p>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-gray-200/80"><CardContent className="p-5"><div className="text-xl font-bold font-mono">{formatINR(rollup.ads.total_spend)}</div><div className="text-xs text-gray-500">Ad spend (all campaigns)</div></CardContent></Card>
                <Card className="border-gray-200/80"><CardContent className="p-5"><div className="text-xl font-bold font-mono">{formatINR(rollup.ads.total_revenue)}</div><div className="text-xs text-gray-500">Ad revenue attributed</div></CardContent></Card>
                <Card className="border-gray-200/80"><CardContent className="p-5"><div className="text-xl font-bold font-mono">{rollup.ads.roas}x</div><div className="text-xs text-gray-500">Blended ROAS</div></CardContent></Card>
                <Card className="border-gray-200/80"><CardContent className="p-5"><div className="text-xl font-bold font-mono">{rollup.social.total_this_month}</div><div className="text-xs text-gray-500">Social posts this month</div></CardContent></Card>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="border-gray-200/80">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-gray-700">Ad campaigns</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {rollup.ads.campaigns.length === 0 && <p className="text-sm text-gray-400">No ad campaigns for this client.</p>}
                    {rollup.ads.campaigns.map((c) => (
                      <Link key={c.id} to={`/ads/${c.id}`} className="flex items-center justify-between rounded-lg border border-gray-200 px-3.5 py-2.5 hover:bg-orange-50/50 transition-colors" data-testid={`growth-campaign-${c.id}`}>
                        <div>
                          <div className="text-sm font-semibold text-gray-800">{c.name}</div>
                          <div className="text-[11px] text-gray-400">{labelize(c.platform)} · {labelize(c.status)}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-sm font-semibold">{formatINR(c.spend)}</div>
                          <div className="text-[11px] text-gray-400">ROAS {c.roas}x</div>
                        </div>
                      </Link>
                    ))}
                  </CardContent>
                </Card>
                <div className="space-y-4">
                  <Card className="border-gray-200/80">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-gray-700">Social — {rollup.social.month}</CardTitle></CardHeader>
                    <CardContent>
                      {rollup.social.by_status.length === 0 ? <p className="text-sm text-gray-400">No posts scheduled this month.</p> : (
                        <div className="flex flex-wrap gap-2">
                          {rollup.social.by_status.map((s) => (
                            <Badge key={s.name} variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">{labelize(s.name)}: {s.value}</Badge>
                          ))}
                        </div>
                      )}
                      <p className="text-[11px] text-gray-400 mt-3">{rollup.social.total_all_time} posts all-time for this client.</p>
                    </CardContent>
                  </Card>
                  <Card className="border-gray-200/80">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-gray-700">Influencer collaborations</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                      {rollup.influencer_collabs.length === 0 && <p className="text-sm text-gray-400">No influencer collaborations yet.</p>}
                      {rollup.influencer_collabs.map((c, i) => (
                        <Link key={i} to={`/influencers/${c.influencer_id}`} className="flex items-center justify-between rounded-lg border border-gray-200 px-3.5 py-2.5 hover:bg-orange-50/50 transition-colors" data-testid={`growth-collab-${i}`}>
                          <div>
                            <div className="text-sm font-semibold text-gray-800">{c.campaign_name}</div>
                            <div className="text-[11px] text-gray-400">{c.influencer_name}{c.handle ? ` · ${c.handle}` : ""} · {c.date}</div>
                          </div>
                          <span className="font-mono text-sm font-semibold">{formatINR(c.amount || 0)}</span>
                        </Link>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="contacts" className="mt-4 space-y-2">
          {(client.contacts || []).length === 0 && <p className="text-sm text-gray-400">No contacts recorded.</p>}
          {(client.contacts || []).map((c, i) => (
            <Card key={i} className="border-gray-200/80"><CardContent className="p-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-gray-800">{c.name} <span className="text-xs font-normal text-gray-400 ml-1">{c.role}</span></div>
                <div className="text-xs text-gray-500">{c.email} · {c.phone}</div>
              </div>
            </CardContent></Card>
          ))}
        </TabsContent>

        <TabsContent value="contracts" className="mt-4 space-y-2" data-testid="contracts-tab-content">
          {(client.contracts || []).length === 0 && <p className="text-sm text-gray-400">No contracts recorded.</p>}
          {(client.contracts || []).map((c) => {
            const days = daysUntil(c.expiry_date);
            const expired = days !== null && days < 0;
            const expiring = days !== null && days >= 0 && days <= 30;
            return (
              <Card key={c.id} className={`border-gray-200/80 ${expiring ? "border-amber-300 bg-amber-50/40" : ""}`} data-testid={`contract-card-${c.id}`}>
                <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-800">{c.title}</div>
                    <div className="text-xs text-gray-500">{c.start_date} → {c.expiry_date}{c.note ? ` · ${c.note}` : ""}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-semibold">{formatINR(c.value)}</span>
                    {expired && <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">Expired</Badge>}
                    {expiring && <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300" data-testid={`contract-expiring-flag-${c.id}`}>Expires in {days}d</Badge>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="credentials" className="mt-4 space-y-2" data-testid="credentials-tab-content">
          {(client.credentials || []).length === 0 && <p className="text-sm text-gray-400">No credential references stored.</p>}
          {(client.credentials || []).map((cred) => (
            <CredentialRow key={cred.id} clientId={id} cred={cred} canReveal={canReveal} canManage={canReveal} onDeleted={() => deleteCredential(cred.id)} />
          ))}
          {canReveal && (
            showCredForm ? (
              <Card className="border-gray-200/80"><CardContent className="p-4 grid grid-cols-2 sm:grid-cols-[1fr_1fr_1fr_auto_auto] gap-2 items-center">
                <Input className="col-span-2 sm:col-span-1" placeholder="Label" value={newCred.label} onChange={(e) => setNewCred((p) => ({ ...p, label: e.target.value }))} data-testid="new-credential-label" />
                <Input placeholder="Username" value={newCred.username} onChange={(e) => setNewCred((p) => ({ ...p, username: e.target.value }))} data-testid="new-credential-username" />
                <Input placeholder="Secret" type="password" value={newCred.secret} onChange={(e) => setNewCred((p) => ({ ...p, secret: e.target.value }))} data-testid="new-credential-secret" />
                <Button size="sm" onClick={addCredential} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="save-credential-btn">Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowCredForm(false)}>Cancel</Button>
              </CardContent></Card>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setShowCredForm(true)} data-testid="add-credential-btn">
                <Plus className="h-3.5 w-3.5 mr-1" /> Add credential
              </Button>
            )
          )}
          {!canReveal && <p className="text-xs text-gray-400 mt-2">Only Admin and PM can reveal secrets.</p>}
        </TabsContent>

        <TabsContent value="details" className="mt-4">
          <Card className="border-gray-200/80"><CardContent className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div><div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Registrar</div>{client.domain_hosting?.registrar || "—"}</div>
            <div><div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Domain expiry</div>{client.domain_hosting?.domain_expiry || "—"}</div>
            <div><div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Host</div>{client.domain_hosting?.host || "—"}</div>
            <div><div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Hosting expiry</div>{client.domain_hosting?.hosting_expiry || "—"}</div>
            <div className="sm:col-span-2">
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Google Drive</div>
              {client.google_drive_link ? (
                <a href={client.google_drive_link} target="_blank" rel="noopener noreferrer" className="text-[#F26B21] hover:underline inline-flex items-center gap-1" data-testid="drive-link-details">
                  {client.google_drive_link} <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : "—"}
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <Card className="border-gray-200/80"><CardContent className="p-5">
            <p className="text-sm text-gray-700 whitespace-pre-wrap" data-testid="client-notes-text">{client.notes || "No notes yet."}</p>
            {canWrite && <Button variant="outline" size="sm" className="mt-4" onClick={() => setEditOpen(true)}>Edit notes</Button>}
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <ClientFormDialog open={editOpen} onOpenChange={setEditOpen} client={client} onSaved={load} />
    </div>
  );
}
