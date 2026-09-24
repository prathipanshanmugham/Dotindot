from pydantic import BaseModel, Field
from typing import List, Optional
import uuid


def new_id():
    return str(uuid.uuid4())


# ---------- Auth / Users ----------
class LoginRequest(BaseModel):
    email: str
    password: str


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: str  # admin | finance | sales | pm | employee


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


# ---------- Clients ----------
class Contact(BaseModel):
    name: str
    email: Optional[str] = ""
    phone: Optional[str] = ""
    role: Optional[str] = ""


class DomainHosting(BaseModel):
    registrar: Optional[str] = ""
    domain_expiry: Optional[str] = None
    host: Optional[str] = ""
    hosting_expiry: Optional[str] = None


class CredentialIn(BaseModel):
    label: str
    username: str
    secret: Optional[str] = ""


class Contract(BaseModel):
    id: str = Field(default_factory=new_id)
    title: str
    value: float = 0
    currency: str = "INR"
    start_date: Optional[str] = None
    expiry_date: Optional[str] = None
    file_link: Optional[str] = ""
    note: Optional[str] = ""


class ClientCreate(BaseModel):
    name: str
    company: Optional[str] = ""
    industry: Optional[str] = ""
    service_type: Optional[str] = "web_dev"  # web_dev | marketing | ai | retainer | one_off
    size: Optional[str] = "small"  # small | mid | large
    status: Optional[str] = "active"  # active | inactive | churned
    retainer: bool = False
    region: Optional[str] = ""
    state: Optional[str] = ""
    city: Optional[str] = ""
    google_drive_link: Optional[str] = ""
    contacts: List[Contact] = []
    domain_hosting: Optional[DomainHosting] = None
    contracts: List[Contract] = []
    credentials: List[CredentialIn] = []
    notes: Optional[str] = ""
    currency: str = "INR"


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    company: Optional[str] = None
    industry: Optional[str] = None
    service_type: Optional[str] = None
    size: Optional[str] = None
    status: Optional[str] = None
    retainer: Optional[bool] = None
    region: Optional[str] = None
    state: Optional[str] = None
    city: Optional[str] = None
    google_drive_link: Optional[str] = None
    contacts: Optional[List[Contact]] = None
    domain_hosting: Optional[DomainHosting] = None
    contracts: Optional[List[Contract]] = None
    notes: Optional[str] = None


# ---------- Projects ----------
class Milestone(BaseModel):
    id: str = Field(default_factory=new_id)
    title: str
    due_date: Optional[str] = None
    done: bool = False


class Deliverable(BaseModel):
    id: str = Field(default_factory=new_id)
    item: str
    done: bool = False


class ProjectCreate(BaseModel):
    client_id: str
    name: str
    description: Optional[str] = ""
    status: str = "kickoff"  # kickoff | in_progress | review | completed | on_hold
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    budget: float = 0
    currency: str = "INR"
    milestones: List[Milestone] = []
    deliverables: List[Deliverable] = []
    team_member_ids: List[str] = []
    location: Optional[str] = ""
    cost_allocation: float = 0


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    budget: Optional[float] = None
    milestones: Optional[List[Milestone]] = None
    deliverables: Optional[List[Deliverable]] = None
    team_member_ids: Optional[List[str]] = None
    location: Optional[str] = None
    cost_allocation: Optional[float] = None


class ToggleRequest(BaseModel):
    kind: str  # "milestone" | "deliverable"
    item_id: str


# ---------- Finance ----------
class TransactionCreate(BaseModel):
    type: str  # income | expense
    date: str
    amount: float
    category: str
    description: Optional[str] = ""
    client_id: Optional[str] = None
    project_id: Optional[str] = None
    invoice_ref: Optional[str] = ""
    payment_method: Optional[str] = "bank_transfer"
    campaign_id: Optional[str] = None
    ai_tool: Optional[str] = None
    source: Optional[str] = None
    currency: str = "INR"


class TransactionUpdate(BaseModel):
    type: Optional[str] = None
    date: Optional[str] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    description: Optional[str] = None
    client_id: Optional[str] = None
    project_id: Optional[str] = None
    invoice_ref: Optional[str] = None
    payment_method: Optional[str] = None
    campaign_id: Optional[str] = None
    ai_tool: Optional[str] = None
    source: Optional[str] = None


class ExpenseCreate(BaseModel):
    category: str  # operational | marketing | tools | salaries | misc | ai
    amount: float
    date: str
    description: Optional[str] = ""
    receipt_path: Optional[str] = None
    receipt_link: Optional[str] = ""
    client_id: Optional[str] = None
    project_id: Optional[str] = None
    ai_tool: Optional[str] = None
    currency: str = "INR"


class SubscriptionCreate(BaseModel):
    name: str
    vendor: Optional[str] = ""
    cost: float
    billing_cycle: str = "monthly"  # monthly | quarterly | yearly
    next_renewal_date: Optional[str] = None
    owner: Optional[str] = ""
    category: Optional[str] = "general"
    is_ai: bool = False
    status: str = "active"  # active | cancelled
    currency: str = "INR"


class SubscriptionUpdate(BaseModel):
    name: Optional[str] = None
    vendor: Optional[str] = None
    cost: Optional[float] = None
    billing_cycle: Optional[str] = None
    next_renewal_date: Optional[str] = None
    owner: Optional[str] = None
    category: Optional[str] = None
    is_ai: Optional[bool] = None
    status: Optional[str] = None


class BudgetCreate(BaseModel):
    period: str  # "2026-09" or "2026-Q3"
    category: str
    amount: float
    currency: str = "INR"


class CampaignCreate(BaseModel):
    name: str
    channel: str = "meta"  # meta | google | linkedin | other
    spend: float = 0
    period: Optional[str] = ""
    client_id: Optional[str] = None
    currency: str = "INR"


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    channel: Optional[str] = None
    spend: Optional[float] = None
    period: Optional[str] = None
    client_id: Optional[str] = None


# ---------- Sales ----------
class LeadCreate(BaseModel):
    name: str
    company: Optional[str] = ""
    contact_email: Optional[str] = ""
    contact_phone: Optional[str] = ""
    source: str = "other"  # referral | website | ads | linkedin | cold_outreach | event | other
    estimated_value: float = 0
    service_interest: Optional[str] = ""
    stage: str = "new"
    owner_id: Optional[str] = None
    region: Optional[str] = ""
    city: Optional[str] = ""
    notes: Optional[str] = ""
    follow_up_date: Optional[str] = None
    currency: str = "INR"


class LeadUpdate(BaseModel):
    name: Optional[str] = None
    company: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    source: Optional[str] = None
    estimated_value: Optional[float] = None
    service_interest: Optional[str] = None
    owner_id: Optional[str] = None
    region: Optional[str] = None
    city: Optional[str] = None
    notes: Optional[str] = None
    follow_up_date: Optional[str] = None


class StageChange(BaseModel):
    stage: str


class LeadActivityCreate(BaseModel):
    kind: str = "note"  # call | email | meeting | note
    text: str
    date: Optional[str] = None
    follow_up_date: Optional[str] = None


class ConvertRequest(BaseModel):
    mode: str = "new_client"  # new_client | existing_client
    client_id: Optional[str] = None
    client: Optional[ClientCreate] = None


class QuoteItem(BaseModel):
    description: str
    qty: float = 1
    unit_price: float = 0


class QuoteCreate(BaseModel):
    title: str
    lead_id: Optional[str] = None
    client_id: Optional[str] = None
    items: List[QuoteItem] = []
    gst_enabled: bool = True
    validity_date: Optional[str] = None
    notes: Optional[str] = ""
    status: str = "draft"


class QuoteUpdate(BaseModel):
    title: Optional[str] = None
    lead_id: Optional[str] = None
    client_id: Optional[str] = None
    items: Optional[List[QuoteItem]] = None
    gst_enabled: Optional[bool] = None
    validity_date: Optional[str] = None
    notes: Optional[str] = None


class QuoteStatusChange(BaseModel):
    status: str  # draft | sent | accepted | rejected


class TargetCreate(BaseModel):
    scope: str = "user"  # user | team
    user_id: Optional[str] = None
    period: str  # 2026-09 or 2026-Q3
    amount: float
    currency: str = "INR"


# ---------- Phase 4: Employees & Training ----------
class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    designation: Optional[str] = None
    department: Optional[str] = None
    skills: Optional[List[str]] = None
    city: Optional[str] = None
    phone: Optional[str] = None
    join_date: Optional[str] = None
    bio: Optional[str] = None


class CourseCreate(BaseModel):
    title: str
    category: Optional[str] = ""
    provider: Optional[str] = ""
    duration_hours: float = 0
    link: Optional[str] = ""
    description: Optional[str] = ""


class CourseUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    provider: Optional[str] = None
    duration_hours: Optional[float] = None
    link: Optional[str] = None
    description: Optional[str] = None


class TrainingAssign(BaseModel):
    user_id: str
    course_id: str
    due_date: Optional[str] = None


class TrainingProgressUpdate(BaseModel):
    progress: Optional[int] = None
    status: Optional[str] = None  # assigned | in_progress | completed


# ---------- Phase 4: Partnerships ----------
class Benefit(BaseModel):
    id: str = Field(default_factory=new_id)
    title: str
    credit_value: float = 0
    used: bool = False
    used_at: Optional[str] = None
    note: Optional[str] = ""


class PartnershipCreate(BaseModel):
    name: str
    partner_type: str = "platform"  # platform | program | membership | vendor
    category: Optional[str] = ""
    cost: float = 0
    billing_cycle: str = "yearly"  # monthly | quarterly | yearly
    renewal_date: Optional[str] = None
    contact_name: Optional[str] = ""
    contact_email: Optional[str] = ""
    website: Optional[str] = ""
    status: str = "active"  # active | expired | cancelled
    benefits: List[Benefit] = []
    notes: Optional[str] = ""
    currency: str = "INR"


class PartnershipUpdate(BaseModel):
    name: Optional[str] = None
    partner_type: Optional[str] = None
    category: Optional[str] = None
    cost: Optional[float] = None
    billing_cycle: Optional[str] = None
    renewal_date: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    website: Optional[str] = None
    status: Optional[str] = None
    benefits: Optional[List[Benefit]] = None
    notes: Optional[str] = None
