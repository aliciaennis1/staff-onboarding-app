// How each candidate pre-employment form is shown to staff (index.html).
// Field ids match candidate.html.

const HEALTH_QUESTIONS = [
  'Have you ever had any illness, medical problem or disability that may currently affect your ability to work safely as a teacher?',
  'Have you ever been medically retired from any job, or left any job because of ill health?',
  'Have you changed your patterns or methods of work or had any modifications/adjustments to your work for medical reasons?',
  'Heart disease, rheumatic fever or high blood pressure?',
  'Any lung disease including bronchitis, emphysema, asthma or TB?',
  'In the last 12 months had a cough lasting more than 3 weeks?',
  'Diabetes?',
  'Hepatitis or jaundice?',
  'Kidney or urinary complaint or blood in the urine?',
  'Recurring headaches, fits, fainting, blackouts, dizziness, loss of balance?',
  'Have you ever suffered from any mental illness, psychological or psychiatric problem, including depression, anxiety, nervous debility, nervous breakdown, schizophrenia or eating disorder (anorexia or bulimia)?',
  'Treatment for drug or drink dependency?',
  'Dermatitis, eczema, or other skin disorder?',
  'Are you allergic to anything?',
  'Any hearing difficulties?',
  'Any other ear conditions?',
  'Any eye trouble, e.g. any difficulty in reading print of standard size or in using DSE?',
  'Colour blindness?',
  'Do you wear glasses or contact lenses?',
  'Any serious accidents or injuries in the past?',
  'Any back pain or neck pain, arthritis, other joint pain, or stiffness which affects moving around?',
  'Any other illness or disease?',
  'Any operations or hospital admissions?',
  'Have you consulted a doctor within the last two years?',
  'Are you taking any medications?',
  'Have you any medical complaints at the moment?',
  'Have you any medical conditions which you believe to have been caused or made worse by work?',
  'Do you need, or would it assist you to have any special provision made to enable you to fulfil your training and/or subsequent employment?'
];

const CANDIDATE_FORMS = {
  employee_details: {
    title: 'Employee Details and Emergency Contacts',
    checklistItem: 'employee-detail',
    sections: [
      ['Personal details', [['ed_name', 'Full name'], ['ed_dob', 'Date of birth', 'date'], ['ed_nhs', 'NHS number'], ['ed_hospital_num', 'Hospital patient number'], ['ed_address', 'Address'], ['ed_postcode', 'Postcode']]],
      ['Medical information', [['ed_medical', 'Allergies and illnesses'], ['ed_medication', 'Medication'], ['ed_medication_location', 'Where medication is kept']]],
      ['Emergency contact 1', [['ec1_name', 'Full name'], ['ec1_address', 'Address'], ['ec1_postcode', 'Postcode'], ['ec1_home', 'Home number'], ['ec1_mobile', 'Mobile number']]],
      ['Emergency contact 2', [['ec2_name', 'Full name'], ['ec2_address', 'Address'], ['ec2_postcode', 'Postcode'], ['ec2_home', 'Home number'], ['ec2_mobile', 'Mobile number']]],
      ['Additional information', [['ed_further', 'Further information']]],
      ['Declaration', [['ed_print_name', 'Print name'], ['ed_signature', 'Signature'], ['ed_sig_date', 'Date', 'date']]]
    ]
  },
  health_questionnaire: {
    title: 'Health Questionnaire (strictly confidential)',
    checklistItem: 'health-decl',
    sections: [
      ['Personal details', [['hq_title', 'Title'], ['hq_surname', 'Surname'], ['hq_forenames', 'Forenames'], ['hq_dob', 'Date of birth', 'date'], ['hq_ni', 'National Insurance number'], ['hq_address', 'Address'], ['hq_home_email', 'Home email'], ['hq_work_email', 'Work email'], ['hq_home_tel', 'Home telephone'], ['hq_mobile', 'Mobile'], ['hq_department', 'Department'], ['hq_site', 'Site'], ['hq_post', 'Post applied for'], ['hq_age_range', 'Age range to be taught'], ['hq_last_post', 'Last teaching post']]],
      ['Medical history', 'health'],
      ['Declaration', [['hq_print_name', 'Print name'], ['hq_signature', 'Signature'], ['hq_sig_date', 'Date', 'date']]]
    ]
  },
  bank_details: {
    title: 'Bank Details',
    checklistItem: 'bank-details',
    sections: [
      ['Account holder', [['bd_account_name', 'Name on account'], ['bd_address', 'Registered address'], ['bd_postcode', 'Postcode']]],
      ['Bank or building society', [['bd_bank_name', 'Bank name'], ['bd_account_no', 'Account number'], ['bd_sort_code', 'Sort code']]],
      ['Authorisation', [['bd_print_name', 'Print name'], ['bd_signature', 'Signature'], ['bd_sig_date', 'Date', 'date']]]
    ]
  }
};

const FORM_FOR_ITEM = Object.fromEntries(Object.entries(CANDIDATE_FORMS).map(([k, f]) => [f.checklistItem, k]));
const PAYROLL_FORMS = ['employee_details', 'bank_details'];
