'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineError, apiErrorMessage } from '@/components/ui/state';
import { api } from '@/lib/api';
import type { InterviewSession } from '@/lib/types';

export function FocusedPracticeButton({
  reportId,
  compact = false,
  onCreated
}: {
  reportId: string;
  compact?: boolean;
  onCreated?: (session: InterviewSession) => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function startFocusedPractice() {
    setLoading(true);
    setError('');
    try {
      const session = await api<InterviewSession>(`/interviews/reports/${reportId}/focused-session`, { method: 'POST' });
      if (onCreated) onCreated(session);
      else router.push(`/interviews?sessionId=${session.id}`);
    } catch (nextError) {
      setError(apiErrorMessage(nextError, '专项训练创建失败，请确认 AI 配置和后端服务状态。'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <Button className={compact ? 'h-8 px-3' : undefined} onClick={() => void startFocusedPractice()} disabled={loading}>
        <Target className="h-4 w-4" />
        {loading ? '创建中' : '开始专项训练'}
      </Button>
      {error && <InlineError title="专项训练创建失败" description={error} />}
    </div>
  );
}
