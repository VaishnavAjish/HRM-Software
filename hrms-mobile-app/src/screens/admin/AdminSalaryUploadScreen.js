import React, { useMemo, useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { typography } from '../../theme';
import { api } from '../../services/api';
import { SelectField } from '../../components/common/SelectField';
import { BulkUploadFlow } from '../../components/admin/BulkUploadFlow';
import { COMPANY_OPTIONS, getCompanyUnits } from '../../utils/companyConfig';

// Month/year are deliberately NOT pre-upload fields here — the backend reads
// them per row from the spreadsheet's own month/year columns
// (AdminController::salarySlipImport → parseSalaryMonthYear), not from a
// batch-level value, so a picker here would imply control the server ignores.
export function AdminSalaryUploadScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const isUnitScoped = Number(user?.role) === 2;
  const [companyCode, setCompanyCode] = useState(isUnitScoped ? user.company_code : '');
  const unitOptions = useMemo(() => getCompanyUnits(companyCode), [companyCode]);
  const [unit, setUnit] = useState(isUnitScoped ? user.unit : '');

  return (
    <BulkUploadFlow
      type="salary"
      title="Bulk Import Salary Slips"
      getColumns={() => api.getSalaryImportColumns()}
      uploadFn={(formData) => api.importSalarySlips(formData)}
      fileFieldName="salary_slip"
      extra={{ company_code: companyCode, unit }}
      renderExtraFields={() => (
        <>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Company / Unit</Text>
          {isUnitScoped ? (
            <Text style={[styles.hintText, { color: theme.textMuted }]}>
              Locked to your assigned company and unit ({user.company_code} · {user.unit}).
            </Text>
          ) : (
            <>
              <SelectField value={companyCode} onChange={(v) => { setCompanyCode(v); setUnit(''); }} options={COMPANY_OPTIONS} placeholder="Select company" searchable={false} />
              {companyCode ? (
                <SelectField label="Unit / Branch" value={unit} onChange={setUnit} options={unitOptions} placeholder="Any unit" searchable={false} />
              ) : null}
            </>
          )}
        </>
      )}
    />
  );
}

const styles = StyleSheet.create({
  sectionTitle: { ...typography.h4, marginBottom: 8 },
  hintText: { ...typography.caption, marginBottom: 4 },
});
