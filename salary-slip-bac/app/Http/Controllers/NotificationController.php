<?php

namespace App\Http\Controllers;

use App\Models\Notification;
use Illuminate\Http\Request;

/**
 * The signed-in user's own notifications.
 *
 * Every query is anchored on auth()->id(). There is no "read someone else's
 * bell" path and no id-based lookup that could reach another user's row: a
 * notification names who raised a ticket and often quotes the message, so the
 * blast radius of getting this wrong is somebody else's support conversation.
 */
class NotificationController extends Controller
{
    public function index(Request $request)
    {
        $actor = auth('api')->user();

        $query = Notification::query()
            ->where('user_id', $actor->id)
            ->orderByDesc('created_at');

        if ($request->boolean('unread_only')) {
            $query->unread();
        }

        if ($request->filled('module')) {
            $query->where('module', $request->module);
        }

        // Capped: the drawer shows a feed, not an archive, and an account left
        // running for months should not pull thousands of rows on every poll.
        $limit = min((int) ($request->limit ?? 50), 200);

        return response()->json([
            'status' => true,
            'data' => $query->limit($limit)->get(),
            'meta' => [
                'unread' => Notification::where('user_id', $actor->id)->unread()->count(),
            ],
        ]);
    }

    /** Cheap enough to poll for the bell badge. */
    public function unreadCount()
    {
        return response()->json([
            'status' => true,
            'data' => [
                'unread' => Notification::where('user_id', auth('api')->id())->unread()->count(),
            ],
        ]);
    }

    public function markRead($id)
    {
        $notification = Notification::where('user_id', auth('api')->id())->find($id);

        if (! $notification) {
            return response()->json(['status' => false, 'message' => 'Notification not found'], 404);
        }

        // Idempotent: re-reading must not move the timestamp, which is what the
        // read receipt is based on.
        if ($notification->read_at === null) {
            $notification->forceFill(['read_at' => now()])->save();
        }

        return response()->json(['status' => true, 'data' => $notification]);
    }

    public function markAllRead()
    {
        $updated = Notification::where('user_id', auth('api')->id())
            ->unread()
            ->update(['read_at' => now(), 'updated_at' => now()]);

        return response()->json([
            'status' => true,
            'message' => "{$updated} notification(s) marked read",
        ]);
    }

    /** Clears the feed for this user only. History of the ticket is untouched. */
    public function destroy($id)
    {
        $notification = Notification::where('user_id', auth('api')->id())->find($id);

        if (! $notification) {
            return response()->json(['status' => false, 'message' => 'Notification not found'], 404);
        }

        $notification->delete();

        return response()->json(['status' => true, 'message' => 'Notification removed']);
    }
}
