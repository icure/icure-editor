// The forms of the example, in the order of the list.
import { basophilActivationTest } from './basophilActivationTest.ts'
import { compressionPrescription } from './compressionPrescription.ts'
import { hipProsthesisOrder } from './hipProsthesisOrder.ts'
import { imagingRequest } from './imagingRequest.ts'
import { labRequest } from './labRequest.ts'
import { radiologyRequest } from './radiologyRequest.ts'
import { surgeryAnnouncement } from './surgeryAnnouncement.ts'
import { surgicalAdmission } from './surgicalAdmission.ts'
import { theatreAdmission } from './theatreAdmission.ts'
import { urgentAdmission } from './urgentAdmission.ts'
import type { Form } from './types.ts'

export const FORMS: readonly Form[] = [surgeryAnnouncement, theatreAdmission, surgicalAdmission, urgentAdmission, radiologyRequest, imagingRequest, labRequest, basophilActivationTest, compressionPrescription, hipProsthesisOrder]

export const formById = (id: string): Form | undefined => FORMS.find((f) => f.id === id)
export type { Form } from './types.ts'
