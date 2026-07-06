export interface OrgNode {
  id: string
  full_name: string
  email?: string | null
  role_title?: string | null
  department_id?: string | null
  department_name?: string | null
  employment_type?: string | null
  hire_date?: string | null
  status?: string | null
  photo_url?: string | null
  manager?: string | null
  manager_name?: string | null
  direct_reports_count: number
  has_reports: boolean
}

export interface OrgSearchHit extends OrgNode {
  ancestor_ids: string[]
}

export interface DepartmentGroup {
  id: string
  name: string
  head_count: number
}
