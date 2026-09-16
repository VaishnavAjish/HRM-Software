import os  
filepath = 'F:/HRMS oldd/salary-slip-front/salary-slip-front/src/pages/admin/hr/onboarding/TimelineTab.jsx'  
with open(filepath, 'r', encoding='utf-8') as f:  
    content = f.read()  
target = 'unit: candidate.unit_name || candidate.unit || candidate.location || \" "\\\n    };\\n  }, [candidate, onboardingDetails]);'  
replacement = 'unit: candidate.unit_name || candidate.unit || candidate.location || \\,\\n      members: onboardingDetails?.family_members || []\\n    };\\n  }, [candidate, onboardingDetails]);'  
if target in content:  
    content = content.replace(target, replacement)  
    with open(filepath, 'w', encoding='utf-8') as f:  
        f.write(content)  
    print('Successfully patched TimelineTab.jsx')  
else:  
    print('Target not found in TimelineTab.jsx')  
