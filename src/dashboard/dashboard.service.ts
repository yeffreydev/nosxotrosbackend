import { Injectable } from '@nestjs/common';
import {
  AssignmentStatus,
  BeneficiaryStatus,
  DonationStatus,
  DonationType,
  EmergencyStatus,
  PaymentStatus,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublic() {
    const [
      raisedAgg,
      donationsCount,
      volunteersCount,
      hoursAgg,
      beneficiariesServed,
      activeEmergencies,
      centersRaw,
      needsRaw,
    ] = await Promise.all([
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          status: PaymentStatus.PAID,
          donation: { type: DonationType.MONEY },
        },
      }),
      this.prisma.donation.count(),
      this.prisma.user.count({ where: { role: Role.VOLUNTEER } }),
      this.prisma.volunteerProfile.aggregate({ _sum: { totalHours: true } }),
      this.prisma.beneficiary.count({
        where: { status: BeneficiaryStatus.SERVED },
      }),
      this.prisma.emergency.count({
        where: { status: EmergencyStatus.ACTIVE },
      }),
      this.prisma.center.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.need.findMany({
        include: {
          category: true,
          emergency: { select: { id: true, title: true, status: true } },
        },
      }),
    ]);

    const centers = centersRaw.map((c) => ({
      id: c.id,
      name: c.name,
      lat: c.lat,
      lng: c.lng,
      status: c.status,
      capacity: c.capacity,
      currentLoad: c.currentLoad,
      loadPct:
        c.capacity > 0 ? Math.round((c.currentLoad / c.capacity) * 100) : 0,
    }));

    const topNeeds = needsRaw
      .map((n) => ({
        id: n.id,
        title: n.title,
        targetQty: n.targetQty,
        fulfilledQty: n.fulfilledQty,
        gap: Math.max(0, n.targetQty - n.fulfilledQty),
        unit: n.unit,
        priority: n.priority,
        isBlocked: n.isBlocked,
        category: n.category ? n.category.name : null,
        emergency: n.emergency,
      }))
      .filter((n) => n.gap > 0 && !n.isBlocked)
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 8);

    return {
      totalRaised: raisedAgg._sum.amount ?? 0,
      donationsCount,
      volunteersCount,
      hoursLogged: Math.round((hoursAgg._sum.totalHours ?? 0) * 10) / 10,
      beneficiariesServed,
      activeEmergencies,
      centers,
      topNeeds,
    };
  }

  async getKpis() {
    const [
      receivedCount,
      deliveredCount,
      dispatches,
      totalAssignments,
      checkedInAssignments,
      surveys,
      donationsByTypeRaw,
      inventoryByCatRaw,
      categories,
    ] = await Promise.all([
      this.prisma.donation.count({
        where: {
          status: {
            in: [
              DonationStatus.RECEIVED,
              DonationStatus.IN_TRANSIT,
              DonationStatus.DELIVERED,
            ],
          },
        },
      }),
      this.prisma.donation.count({
        where: { status: DonationStatus.DELIVERED },
      }),
      this.prisma.dispatch.findMany({
        where: { deliveredAt: { not: null } },
        select: { createdAt: true, deliveredAt: true },
      }),
      this.prisma.shiftAssignment.count(),
      this.prisma.shiftAssignment.count({
        where: {
          status: {
            in: [AssignmentStatus.CHECKED_IN, AssignmentStatus.CHECKED_OUT],
          },
        },
      }),
      this.prisma.surveyResponse.findMany({
        select: { kind: true, score: true },
      }),
      this.prisma.donation.groupBy({
        by: ['type'],
        _count: { _all: true },
      }),
      this.prisma.inventoryItem.groupBy({
        by: ['categoryId'],
        _sum: { quantity: true },
      }),
      this.prisma.category.findMany(),
    ]);

    // traceability
    const traceabilityPct =
      receivedCount > 0
        ? Math.round((deliveredCount / receivedCount) * 1000) / 10
        : 0;

    // avg deploy minutes
    let avgDeployMinutes = 0;
    if (dispatches.length > 0) {
      const totalMin = dispatches.reduce((acc, d) => {
        if (!d.deliveredAt) return acc;
        // Math.abs guards against seed/backdated rows where deliveredAt predates createdAt
        return (
          acc + Math.abs(d.deliveredAt.getTime() - d.createdAt.getTime()) / 60000
        );
      }, 0);
      avgDeployMinutes = Math.round((totalMin / dispatches.length) * 10) / 10;
    }

    // volunteer conversion
    const volunteerConversionPct =
      totalAssignments > 0
        ? Math.round((checkedInAssignments / totalAssignments) * 1000) / 10
        : 0;

    // effective collection (approx: delivered / received)
    const effectiveCollectionPct =
      receivedCount > 0
        ? Math.round((deliveredCount / receivedCount) * 1000) / 10
        : 0;

    // NPS
    const npsResponses = surveys.filter((s) => s.kind === 'nps');
    let nps = 0;
    if (npsResponses.length > 0) {
      const promoters = npsResponses.filter((s) => s.score >= 9).length;
      const detractors = npsResponses.filter((s) => s.score <= 6).length;
      nps = Math.round(
        ((promoters - detractors) / npsResponses.length) * 100,
      );
    }

    // ease avg
    const easeResponses = surveys.filter((s) => s.kind === 'ease');
    const easeAvg =
      easeResponses.length > 0
        ? Math.round(
            (easeResponses.reduce((a, s) => a + s.score, 0) /
              easeResponses.length) *
              10,
          ) / 10
        : 0;

    // donations by type
    const donationsByType: Record<string, number> = {
      MONEY: 0,
      GOODS: 0,
      TIME: 0,
    };
    for (const row of donationsByTypeRaw) {
      donationsByType[row.type] = row._count._all;
    }

    // donations trend (last 7 days)
    const donationsTrend = await this.donationsTrend();

    // inventory by category
    const catMap = new Map(categories.map((c) => [c.id, c.name]));
    const inventoryByCategory = inventoryByCatRaw.map((row) => ({
      category: catMap.get(row.categoryId) ?? 'Sin categoría',
      categoryId: row.categoryId,
      quantity: row._sum.quantity ?? 0,
    }));

    return {
      traceabilityPct,
      avgDeployMinutes,
      volunteerConversionPct,
      effectiveCollectionPct,
      nps,
      easeAvg,
      donationsByType,
      donationsTrend,
      inventoryByCategory,
    };
  }

  private async donationsTrend() {
    const days: { date: string; count: number }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - i);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const count = await this.prisma.donation.count({
        where: { createdAt: { gte: start, lt: end } },
      });
      days.push({ date: start.toISOString().slice(0, 10), count });
    }
    return days;
  }
}
