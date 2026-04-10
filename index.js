import { WorkflowEntrypoint } from 'cloudflare:workers';

// ==========================================
// الجزء الأول: مدير العمليات (Workflow)
// ==========================================
export class AgentWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const userTask = event.payload.task;
    const model = '@cf/google/gemma-4-26b-a4b-it'; // النموذج الذي طلبته

    // ------------------------------------------------
    // الخطوة 1: التخطيط (Plan)
    // ------------------------------------------------
    const plan = await step.do('planning', async () => {
      const response = await this.env.AI.run(model, {
        messages: [
          { role: 'system', content: 'You are an expert planner. Break down the user task into 3 clear, logical steps. Output ONLY the plan, no extra text.' },
          { role: 'user', content: userTask }
        ]
      });
      return response.response;
    });

    // ------------------------------------------------
    // الخطوة 2: التنفيذ (Solve)
    // ------------------------------------------------
    const draftSolution = await step.do('solving', async () => {
      const response = await this.env.AI.run(model, {
        messages: [
          { role: 'system', content: `You are an expert executor. Follow this plan exactly to solve the user's task:\n\n${plan}` },
          { role: 'user', content: userTask }
        ]
      });
      return response.response;
    });

    // ------------------------------------------------
    // الخطوة 3: المراجعة الذاتية والتصحيح (Reflexion)
    // ------------------------------------------------
    const finalPolishedAnswer = await step.do('reflexion', async () => {
      const response = await this.env.AI.run(model, {
        messages: [
          { role: 'system', content: 'You are a harsh but fair critic. Review the draft solution against the original task. Fix any logical errors, improve the formatting, and ensure the tone is highly professional. Output the final perfect answer.' },
          { role: 'user', content: `Original Task: ${userTask}\n\nDraft Solution:\n${draftSolution}\n\nProvide the final refined answer.` }
        ]
      });
      return response.response;
    });

    // يمكنك هنا إضافة خطوة لحفظ النتيجة في قاعدة بيانات أو إرسال إيميل
    console.log("Final Answer Generated!");
    
    // إرجاع النتيجة النهائية
    return finalPolishedAnswer;
  }
}

// ==========================================
// الجزء الثاني: موظف الاستقبال (Worker)
// ==========================================
export default {
  async fetch(request, env) {
    // استخراج المهمة من الرابط (مثال: ?task=how to build a website)
    const url = new URL(request.url);
    const task = url.searchParams.get('task');

    if (!task) {
      return new Response("Please provide a task. Example: ?task=Explain AI", { status: 400 });
    }

    // إرسال المهمة إلى الـ Workflow ليعمل في الخلفية بهدوء
    const instance = await env.MY_AGENT_WORKFLOW.create({
      id: `task-${Date.now()}`,
      params: { task: task }
    });

    // الرد الفوري على المستخدم حتى لا ينتظر طويلاً
    return new Response(JSON.stringify({
      message: "Task accepted! The AI is now Planning, Solving, and Reflecting.",
      workflow_id: instance.id,
      task: task
    }), { 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
};
