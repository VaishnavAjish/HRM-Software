import { formatDate } from "./trial-form-helpers";

const Row = ({ label, value, full }) => (
  <tr>
    <td
      className={`border border-black bg-gray-50 px-3 py-2 text-[12px] font-bold uppercase text-black ${
        full ? "w-1/4" : "w-1/6"
      }`}
    >
      {label}
    </td>
    <td
      className={`border border-black px-3 py-2 text-[13px] font-medium uppercase text-black ${
        full ? "" : "w-1/3"
      }`}
      colSpan={full ? 3 : 1}
    >
      {value || ""}
    </td>
  </tr>
);

export const PrintableTrialForm = ({ data, formRef }) => {
  // The desktop/print table packs two label:value pairs per row (Mobile No 1
  // / Gender, etc.) — even scrolled horizontally that's an awkward way to
  // read a form on a phone, so mobile screens get this flat stacked list
  // instead. Printing always uses the table regardless of the printing
  // device's screen width (see the print: classes below).
  const mobileFields = [
    { label: "Department", value: data.department },
    { label: "Name of Employee", value: data.name },
    { label: "Address", value: data.address },
    { label: "Mobile No 1", value: data.mobileNo1 },
    { label: "Gender", value: data.gender },
    { label: "Mobile No 2", value: data.mobileNo2 },
    { label: "Email Id", value: data.email },
    { label: "Last Company Name", value: data.lastCompanyName },
    { label: "Last Company Address", value: data.lastCompanyAddress },
    { label: "Experience", value: data.experience },
    { label: "Reason for Leaving", value: data.reasonForLeaving },
    {
      label: "Hastak Name & Code",
      value: [data.hastakName, data.hastakCode ? `- ${data.hastakCode}` : ""]
        .filter(Boolean)
        .join(" "),
    },
    { label: "Hastak Mobile No", value: data.hastakMobileNo },
    { label: "Contractor", value: data.contractor },
    { label: "Manager Name", value: data.managerName },
    { label: "Akar", value: data.akar },
  ];

  return (
  <div
    ref={formRef}
    data-trial-print-form
    className="mx-auto w-full max-w-[850px] rounded-lg border border-dotted border-gray-600 bg-white p-6 text-black shadow-sm"
  >
    <div className="mb-1 flex items-start justify-between">
      <div className="flex-1" />
      <div className="flex-1 text-center">
        <h1 className="text-2xl font-black uppercase tracking-widest text-black">
          Nidhi Impex
        </h1>
        <p className="mt-1 inline-block rounded-full bg-gray-900 px-4 py-1 text-xs font-bold uppercase tracking-widest text-white">
          Trial Form
        </p>
      </div>
      <div className="flex-1 space-y-1 text-right text-[13px] font-semibold text-black">
        <p>
          Date : <span className="font-bold">{formatDate(data.date)}</span>
        </p>
        <p>
          Form No : <span className="font-bold">{data.fromNo}</span>
        </p>
      </div>
    </div>
    <div className="mb-2 mt-2 border-t-2 border-black" />

    {/* Mobile-only stacked view — plain top-to-bottom fields, no horizontal
        scroll needed. Hidden from sm: screens up and always hidden when
        printing. */}
    <div className="divide-y divide-black rounded-lg border border-black sm:hidden print:hidden">
      {mobileFields.map(({ label, value }) => (
        <div key={label} className="flex flex-col gap-0.5 px-3 py-2">
          <span className="text-[11px] font-bold uppercase text-black">
            {label}
          </span>
          <span className="text-[13px] font-medium uppercase text-black">
            {value || "-"}
          </span>
        </div>
      ))}
    </div>

    {/* Desktop/print table — same data as above, laid out compactly. Hidden
        below sm: on screen, always shown when printing regardless of the
        printing device's own screen width. */}
    <div className="hidden overflow-x-auto rounded-lg border border-black sm:block print:block">
      <table className="w-full min-w-[600px] border-collapse text-[13px]">
        <tbody>
          <Row label="Department" value={data.department} full />
          <Row label="Name of Employee" value={data.name} full />
          <Row label="Address" value={data.address} full />
          <tr>
            <td className="border border-black bg-gray-50 px-3 py-2 text-[12px] font-bold uppercase text-black">
              Mobile No 1
            </td>
            <td className="border border-black px-3 py-2 text-[13px] font-medium text-black">
              {data.mobileNo1}
            </td>
            <td className="border border-black bg-gray-50 px-3 py-2 text-[12px] font-bold uppercase text-black">
              Gender
            </td>
            <td className="border border-black px-3 py-2 text-[13px] font-medium uppercase text-black">
              {data.gender}
            </td>
          </tr>
          <tr>
            <td className="border border-black bg-gray-50 px-3 py-2 text-[12px] font-bold uppercase text-black">
              Mobile No 2
            </td>
            <td className="border border-black px-3 py-2 text-[13px] font-medium text-black">
              {data.mobileNo2}
            </td>
            <td className="border border-black bg-gray-50 px-3 py-2 text-[12px] font-bold uppercase text-black">
              Email Id
            </td>
            <td className="border border-black px-3 py-2 text-[13px] font-medium lowercase text-black">
              {data.email}
            </td>
          </tr>
          <Row label="Last Company Name" value={data.lastCompanyName} full />
          <Row
            label="Last Company Address"
            value={data.lastCompanyAddress}
            full
          />
          <tr>
            <td className="border border-black bg-gray-50 px-3 py-2 text-[12px] font-bold uppercase text-black">
              Experience
            </td>
            <td className="border border-black px-3 py-2 text-[13px] font-medium uppercase text-black">
              {data.experience}
            </td>
            <td className="border border-black bg-gray-50 px-3 py-2 text-[12px] font-bold uppercase text-black">
              Reason for Leaving
            </td>
            <td className="border border-black px-3 py-2 text-[13px] font-medium uppercase text-black">
              {data.reasonForLeaving}
            </td>
          </tr>
          <tr>
            <td className="border border-black bg-gray-50 px-3 py-2 text-[12px] font-bold uppercase text-black">
              Hastak Name &amp; Code
            </td>
            <td className="border border-black px-3 py-2 text-[13px] font-medium uppercase text-black">
              {data.hastakName} {data.hastakCode ? `- ${data.hastakCode}` : ""}
            </td>
            <td className="border border-black bg-gray-50 px-3 py-2 text-[12px] font-bold uppercase text-black">
              Hastak Mobile No
            </td>
            <td className="border border-black px-3 py-2 text-[13px] font-medium text-black">
              {data.hastakMobileNo}
            </td>
          </tr>
          <Row label="Department" value={data.department} full />
          <Row label="Contractor" value={data.contractor} full />
          <tr>
            <td className="border border-black bg-gray-50 px-3 py-2 text-[12px] font-bold uppercase text-black">
              Manager Name
            </td>
            <td className="border border-black px-3 py-2 text-[13px] font-medium uppercase text-black">
              {data.managerName}
            </td>
            <td className="border border-black bg-gray-50 px-3 py-2 text-[12px] font-bold uppercase text-black">
              Akar
            </td>
            <td className="border border-black px-3 py-2 text-[13px] font-medium uppercase text-black">
              {data.akar}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-x-16 gap-y-8 text-[13px] font-bold text-black">
      <div className="text-center">
        <div className="mb-1 h-8 border-b border-black px-1 text-[13px] font-semibold uppercase">
          {data.empSignature}
        </div>
        <p>Emp - Signature</p>
      </div>
      <div className="text-center">
        <div className="mb-1 h-8 border-b border-black px-1 text-[13px] font-semibold uppercase">
          {data.managerSignature}
        </div>
        <p>Manager</p>
      </div>
      <div className="text-center">
        <div className="mb-1 h-8 border-b border-black px-1 text-[13px] font-semibold uppercase">
          {data.hastakSignature}
        </div>
        <p>Hastak Signature</p>
      </div>
      <div className="text-center">
        <div className="mb-1 h-8 border-b border-black px-1 text-[13px] font-semibold uppercase">
          {data.hrSignature}
        </div>
        <p>H R</p>
      </div>
    </div>
  </div>
  );
};
