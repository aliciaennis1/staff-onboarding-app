// The reference questionnaire, based on the AWS "Reference Questionnaire" Word form.
// Used by reference.html (referee fills it in) and index.html (staff read it).

const RATING_SCALE = ['Excellent', 'Good', 'Satisfactory', 'Unsatisfactory', 'Not known'];

const RATING_STATEMENTS = [
  'Timekeeping',
  'Reliability',
  'Ability to work on own initiative',
  'Communication skills',
  'Ability to meet deadlines',
  'Accuracy',
  'Attitude to clients and customers',
  'Coaching skills',
  'Organisation skills',
  'Management of cost',
  'Ability to take responsibility',
  'Flexibility in approach to work',
  'Response to change',
  'Ability to manage staff',
  'Motivation and commitment to their work',
  'Good working relationship with staff at all levels',
  'Honesty and trustworthiness'
];

const REFERENCE_FORM = [
  {
    title: 'About you',
    fields: [
      { id: 'refName',      label: 'Your name', type: 'text', required: true },
      { id: 'refPhone',     label: 'Contact number', type: 'tel' },
      { id: 'refPosition',  label: 'Your position title', type: 'text', hint: 'If applicable' },
      { id: 'refOrg',       label: 'Name of your organisation', type: 'text', hint: 'If applicable' },
      { id: 'knownFor',     label: 'How long have you known this person?', type: 'text', required: true },
      { id: 'relationship', label: 'Your relationship to this person', type: 'text', required: true }
    ]
  },
  {
    title: 'Employment details',
    intro: 'If this person is or was employed by you, please give these details. If not, leave this section blank.',
    fields: [
      { id: 'empJobTitle', label: 'Job title', type: 'text' },
      { id: 'empStart',    label: 'Date of commencement', type: 'date' },
      { id: 'empEnd',      label: 'Date of leaving', type: 'date', hint: 'Leave blank if they still work for you' },
      { id: 'empReason',   label: 'Reasons for leaving', type: 'textarea' },
      { id: 'reemploy',    label: 'Would you re-employ this person?', type: 'choice', options: ['Yes', 'No', 'Not applicable'], required: true },
      { id: 'reemployWhy', label: 'If no, why not?', type: 'textarea', showIf: ['reemploy', 'No'] }
    ]
  },
  {
    title: 'Ratings',
    intro: 'Please choose the option that best reflects each statement about this person. If you are unable to rate them on a statement, choose Not known.',
    fields: [
      { id: 'ratings', type: 'ratings' }
    ]
  },
  {
    title: 'Supporting statement',
    fields: [
      { id: 'statement', label: "Please give a supporting statement about this person's capabilities and suitability for the position, including evidence for your ratings above.", type: 'textarea', rows: 7, required: true },
      { id: 'discuss',      label: "Would you be willing to discuss this person's skills and capability further if needed?", type: 'choice', options: ['Yes', 'No'] },
      { id: 'discussPhone', label: 'Telephone number we can contact you on', type: 'tel', showIf: ['discuss', 'Yes'] }
    ]
  },
  {
    title: 'Conduct',
    intro: 'If this person has not been employed by you, choose Not applicable.',
    fields: [
      { id: 'disciplined', label: 'Has this person ever been disciplined while in your employment?', type: 'choice', options: ['Yes', 'No', 'Not applicable'], required: true },
      { id: 'disciplinedDetails', label: 'Please give factual details, including all current disciplinary sanctions and any expired sanctions related to the safety and welfare of young people.', type: 'textarea', showIf: ['disciplined', 'Yes'] },
      { id: 'investigated', label: 'Has this person ever been under investigation?', type: 'choice', options: ['Yes', 'No', 'Not applicable'], required: true },
      { id: 'investigatedDetails', label: 'Please give details', type: 'textarea', showIf: ['investigated', 'Yes'] },
      { id: 'cleansing', label: 'Does your organisation have a policy on cleansing disciplinary records from personal files?', type: 'choice', options: ['Yes', 'No', 'Not applicable'] }
    ]
  },
  {
    title: 'Suitability to work with children and young people',
    fields: [
      { id: 'allegations', label: 'Please give details of any substantiated allegations or concerns raised about this person that relate to the health and welfare of children or young people, or their behaviour towards children or young people. Include the outcome, for example whether it was investigated, the conclusion reached and how it was resolved.', hint: 'If there are none, please write "None".', type: 'textarea', rows: 5, required: true },
      { id: 'suitable', label: 'Are you satisfied that this person is suitable to work with children and young people?', type: 'choice', options: ['Yes', 'No'], required: true },
      { id: 'suitableWhy', label: 'Please explain', type: 'textarea', showIf: ['suitable', 'No'] }
    ]
  },
  {
    title: 'Data protection',
    intro: 'Under UK data protection law, the person named would normally be able to see this reference if they asked the school for it. Relevant factual content may be discussed with them.',
    fields: [
      { id: 'confidential', label: 'If there are strong reasons for keeping any of this reference confidential (for example, a risk to you), please explain them here.', type: 'textarea' }
    ]
  }
];

const DECLARATION_TEXT = 'I confirm that this reference is accurate and does not contain any material misstatement or omission.';
