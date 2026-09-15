-- Make the projects moderation queue's live updates actually live.
--
-- Four places in the app call subscribeProjectsChanged(), and all four have been inert since the
-- feature shipped: public.projects was never added to the supabase_realtime publication, so the
-- channel subscribes, reports success, and no postgres_changes event is ever emitted for it. The
-- code reads as "this screen keeps itself up to date" and does not.
--
-- Only the admin queue keeps its subscription. The three student-facing call sites
-- (ProjectsExpoPage, ProjectDetailPage, SubmitProjectPage) are being moved onto the same
-- focus/visibilitychange refresh the announcement ticker uses, for the reason set out at length
-- in src/components/navigation/AnnouncementBar.tsx: concurrent realtime connections are the
-- scarcest resource in this deployment by a wide margin -- a few hundred, against request
-- throughput an order of magnitude higher -- and spending one per anonymous reader to make a
-- rarely-changing showcase update a few seconds sooner is the worst trade available.
--
-- The queue is the opposite case and is worth one: the number of clients is the number of people
-- holding a content-manager role, and a reviewer sitting on the page while submissions arrive is
-- exactly who the feature is for. That is the same judgement the admin dashboard already makes
-- for announcements.
--
-- REPLICA IDENTITY is deliberately left at its default (primary key). FULL would make the old row
-- available in UPDATE and DELETE payloads, which announcements needs and this does not: the queue
-- ignores the payload entirely and re-reads through listForReview(), so the event is a signal,
-- not a source of data. RLS still governs what each subscriber is allowed to be told about.

set local statement_timeout = '60s';

DO $$
BEGIN
    ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."projects";
EXCEPTION
    -- Already a member: this migration has run before, or the table was added by hand in the
    -- dashboard. Either way there is nothing to do and nothing wrong.
    WHEN duplicate_object THEN NULL;
END $$;
