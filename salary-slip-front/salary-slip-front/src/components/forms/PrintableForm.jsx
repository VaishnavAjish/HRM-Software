import React from 'react';

function formatDate(value) {
  if (!value || value === "-") return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const FormRow = ({ label, value }) => (
  <div className="flex flex-row items-end gap-2 py-1">
    <label className="text-[13px] font-bold whitespace-nowrap w-[130px] shrink-0 text-black leading-normal">
      {label}
    </label>
    <span className="font-bold text-black inline">:</span>
    <span className="text-[13px] text-black w-full break-words">{value || ""}</span>
  </div>
);

const FormInline = ({ label, value }) => (
  <div className="flex items-end gap-2 flex-1 py-1">
    <label className="font-bold whitespace-nowrap text-[13px] text-black leading-normal">
      {label}
    </label>
    <span className="font-bold text-black">:</span>
    <span className="border-b border-black flex-1 min-h-[24px] pb-[3px] px-1 text-[13px] font-medium uppercase leading-normal overflow-visible whitespace-nowrap text-black">
      {value || ""}
    </span>
  </div>
);

const PrintableForm = ({ data, formRef }) => (
  <div
    ref={formRef}
    data-appointment-print-form
    className="bg-white p-6 text-black border border-dotted border-gray-600 mx-auto w-full min-w-[720px] max-w-[850px] shadow-sm"
  >
    <div className="text-center mb-0">
      <h1 className="inline-block text-xl font-black tracking-widest uppercase text-black">
        APPOINTMENT FORM
      </h1>
    </div>
    <div className="border-t-2 border-black mt-2 mb-5" />

    <div className="grid grid-cols-12 gap-6 items-start">
      <div className="col-span-5 flex flex-col items-center">
        <div className="w-44 h-56 border border-gray-400 flex items-center justify-center bg-gray-50 overflow-hidden">
          {data.photo ? (
            <img
              src={data.photo}
              alt="Profile"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="text-center text-[10px] text-gray-400 font-bold uppercase">
              NO PHOTO
            </div>
          )}
        </div>
      </div>
      <div className="col-span-7 space-y-3 w-full">
        <FormRow label="Emp. Code" value={data.empCode} />
        <FormRow label="Joining Date" value={formatDate(data.joiningDate)} />
        <FormRow label="Department" value={data.department} />
        <FormRow label="Designation" value={data.designation} />
        <FormRow label="Manager Name" value={data.managerName} />
        <FormRow label="Salary" value={data.salary} />
        <FormRow label="Emp. Mobile No" value={data.empMobile} />
        <FormRow label="Emp. Whatsapp No" value={data.empWhatsapp} />
      </div>
    </div>

    <div className="mt-4 space-y-2.5">
      <div className="flex flex-row items-center gap-2">
        <label className="font-bold w-[130px] shrink-0 text-[13px] text-black">
          Punching No
        </label>
        <span className="font-bold text-black hidden sm:inline">:</span>
        <span className="text-[13px] text-black w-full">
          {data.punchingNo}
        </span>
      </div>
      <div className="flex flex-row items-start gap-2">
        <label className="font-bold w-[130px] shrink-0 pt-1 text-[13px] text-black">
          Name
        </label>
        <span className="font-bold pt-1 text-black hidden sm:inline">:</span>
        <div className="flex-grow text-[13px] font-bold uppercase py-1 text-black">
          {data.fullName}
        </div>
      </div>
      <FormRow label="Email" value={data.email} />
      <FormRow label="Resident Add" value={data.address} />
      <div className="grid grid-cols-3 gap-6 w-full">
        <FormInline label="Village" value={data.village} />
        <FormInline label="Taluka" value={data.taluka} />
        <FormInline label="District" value={data.district} />
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
        <FormRow label="Birth Date" value={formatDate(data.dob)} />
        <FormRow label="Birth Place" value={data.birthPlace} />
        <FormRow label="Gender" value={data.gender} />
        <FormRow label="Cast" value={data.cast} />
        <FormRow label="Marital Status" value={data.maritalStatus} />
        <FormRow label="Blood Group" value={data.bloodGroup} />
        <FormRow label="Reference Name" value={data.refName} />
        <FormRow label="Reference Mobile" value={data.refMobile} />
        <FormRow label="Aadhar Card No" value={data.aadharNo} />
        <FormRow label="Bank Name" value={data.bankName} />
        <FormRow label="PAN Card No" value={data.panNo} />
        <FormRow label="Bank IFSC Code" value={data.ifscCode} />
        <FormRow label="Education" value={data.education} />
        <FormRow label="Bank Account No" value={data.accountNo} />
      </div>
    </div>

    <div
      className="mt-4 overflow-x-auto pb-4"
      style={{ breakInside: "avoid", pageBreakInside: "avoid" }}
    >
      <table className="w-full border-collapse border border-black text-[13px] min-w-[600px] text-black">
        <thead>
          <tr className="font-bold bg-gray-50">
            <th className="border border-black p-1 w-12 text-center">Sr No</th>
            <th className="border border-black p-1">Family Members Name</th>
            <th className="border border-black p-1">Relation</th>
            <th className="border border-black p-1">D.O.B.</th>
            <th className="border border-black p-1">Mobile No</th>
            <th className="border border-black p-1">Occupation</th>
          </tr>
        </thead>
        <tbody>
          {data.members.map((member, index) => (
            <tr key={index}>
              <td className="border border-black px-1 py-1.5 text-center font-bold">
                {index + 1}
              </td>
              <td className="border border-black px-1 py-1.5 uppercase">
                {member.name || ""}
              </td>
              <td className="border border-black px-1 py-1.5 uppercase">
                {member.relation || ""}
              </td>
              <td className="border border-black px-1 py-1.5 text-center">
                {formatDate(member.dob)}
              </td>
              <td className="border border-black px-1 py-1.5 text-center">
                {member.mobile || ""}
              </td>
              <td className="border border-black px-1 py-1.5 uppercase">
                {member.occupation || ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    {/* Kept as one unit so a near-fit page never strands the unit/signature
        line alone on a second sheet — see the print-fit note on the
        container below. */}
    <div style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
      <div className="mt-6 grid grid-cols-3 gap-8 font-bold text-[13px] text-black">
        <div>
          <p className="mb-1">Check By, Manager</p>
          <div className="border-b border-black w-full h-8" />
        </div>
        <div className="text-center">
          <p className="mb-1">Confirm By,</p>
          <div className="border-b border-black w-full h-8" />
          <p className="mt-1 font-normal">(Ketanbhai)</p>
        </div>
        <div className="text-center">
          <p className="mb-1">Auth. By,</p>
          <div className="border-b border-black w-full h-8" />
          <p className="mt-1 font-normal">HR Dept</p>
        </div>
      </div>

      <div className="mt-6 flex justify-between items-end gap-10">
        <div className="flex gap-2 items-end flex-1">
          <span className="font-bold whitespace-nowrap uppercase text-[12px] text-black">
            UNIT NAME :
          </span>
          <span className="border-b border-black flex-grow min-h-[26px] pb-[3px] text-[13px] font-bold uppercase px-1">
            {data.unitName}
          </span>
        </div>
        <div className="flex gap-2 items-end flex-1">
          <span className="font-bold whitespace-nowrap uppercase text-[12px] text-black">
            Emp. Signature :
          </span>
          <span className="border-b border-black flex-grow min-h-[26px] pb-[3px] text-[13px] font-bold uppercase px-1">
            {data.signature}
          </span>
        </div>
      </div>
    </div>
  </div>
);

function CreateCandidateModal({ isOpen, onClose, onSuccess }) {
  const { user } = useAuth();
  const [formData, setFormData] = useState({ name: "", email: "", mobile_number: "", password: "" });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.mobile_number || !formData.password) {
      return toast.error("All fields are required");
    }
    setLoading(true);
    try {
      await authApi.createCandidateAccount(formData, user?.accessToken, user?.tokenType);
      toast.success("Candidate account created successfully");
      onSuccess();
    } catch (error) {
      toast.error(error.message || "Failed to create account");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Candidate Account">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
          <input
            type="text"
            className={inputCls}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="John Doe"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
          <input
            type="email"
            className={inputCls}
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="john@example.com"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mobile Number</label>
          <input
            type="text"
            className={inputCls}
            value={formData.mobile_number}
            onChange={(e) => setFormData({ ...formData, mobile_number: e.target.value })}
            placeholder="9876543210"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
          <input
            type="password"
            className={inputCls}
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            placeholder="Min. 6 characters"
            required
            minLength={6}
          />
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
          <Button variant="secondary" onClick={onClose} type="button">Cancel</Button>
          <Button variant="primary" type="submit" disabled={loading} icon={loading ? <Loader2 className="animate-spin" size={16} /> : null}>
            {loading ? "Creating..." : "Create Account"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}


export default PrintableForm;
