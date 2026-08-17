import EmployeeNode from "./EmployeeNode";
import PositionNode from "./PositionNode";
import DepartmentNode from "./DepartmentNode";

const DEPARTMENT_TYPES = new Set(["department", "team", "section", "sub_department", "company", "enterprise", "legal_entity_profile"]);

export function nodeKindFor(type) {
  if (type === "position") return "position";
  if (type === "employee") return "employee";
  if (DEPARTMENT_TYPES.has(type)) return "department";
  return "department";
}

export const nodeTypes = {
  employee: EmployeeNode,
  position: PositionNode,
  department: DepartmentNode,
};
